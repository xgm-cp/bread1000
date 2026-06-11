'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Bot, Check, Copy, Play, RefreshCw, RotateCcw, Spade, Users } from 'lucide-react'
import { useRouter } from 'next/navigation'
import {
  bet,
  checkOrCall,
  createPracticeState,
  fold,
  selectUpcard,
  startNewMatch,
  startNextHand,
} from '@/lib/poker/engine'
import { maskState } from '@/lib/poker/maskState'
import type { PokerState, PublicPokerState } from '@/lib/poker/types'

type UserInfo = {
  id: string
  name: string
}

type ApiResult = {
  state?: PublicPokerState
  roomCode?: string
  error?: string
  conflict?: boolean
}

type FlyingChip = {
  id: string
  amount: number
  fromX: number
  fromY: number
  dx: number
  dy: number
  scale: number
  allIn: boolean
}

const cardSuit: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣' }

export default function PokerPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserInfo | null>(null)
  const [mode, setMode] = useState<'practice' | 'multi'>('practice')
  const [practiceState, setPracticeState] = useState<PokerState | null>(null)
  const [remoteState, setRemoteState] = useState<PublicPokerState | null>(null)
  const [roomCode, setRoomCode] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState(false)
  const [betAmount, setBetAmount] = useState(5)
  const [flyingChips, setFlyingChips] = useState<FlyingChip[]>([])
  const playerRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const potRef = useRef<HTMLDivElement | null>(null)
  const previousContributions = useRef<Record<string, number> | null>(null)
  const previousRoom = useRef<string | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem('user')
    if (!stored) return
    try {
      const parsed = JSON.parse(stored)
      const id = String(parsed['아이디'] ?? parsed.id ?? parsed.email ?? '')
      const name = String(parsed['이름'] ?? parsed.name ?? id)
      if (id) setUser({ id, name })
    } catch { }
  }, [])

  const state = useMemo(() => {
    if (mode === 'practice' && practiceState && user) return maskState(practiceState, user.id)
    return remoteState
  }, [mode, practiceState, remoteState, user])

  const contributions = state?.contributions ?? {}
  const me = state?.players.find(player => player.id === user?.id)
  const isHost = state?.hostId === user?.id
  const isMyTurn = state?.actorId === user?.id
  const canPickUpcard = state?.street === 'select_upcard' && me && !me.hand.some(card => card.faceUp)
  const myContribution = me && state ? state.contributions[me.id] ?? 0 : 0
  const callAmount = state ? Math.max(0, state.currentBet - myContribution) : 0
  const actionLabel = callAmount > 0 ? `${callAmount} 콜` : '체크'
  const betLabel = state?.currentBet ? `${betAmount} 레이즈` : `${betAmount} 베팅`

  useEffect(() => {
    if (!state) return
    if (previousRoom.current !== state.roomCode) {
      previousRoom.current = state.roomCode
      previousContributions.current = state.contributions ?? {}
      return
    }

    const previous = previousContributions.current
    const next = state.contributions ?? {}
    previousContributions.current = next
    if (!previous || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    for (const player of state.players) {
      const before = previous[player.id] ?? 0
      const after = next[player.id] ?? 0
      const diff = after - before
      if (diff <= 0) continue

      const fromEl = playerRefs.current[player.id]
      const toEl = potRef.current
      if (!fromEl || !toEl) continue

      const from = fromEl.getBoundingClientRect()
      const to = toEl.getBoundingClientRect()
      const fromX = from.left + from.width / 2
      const fromY = from.top + Math.min(from.height - 28, 72)
      const toX = to.left + to.width / 2
      const toY = to.top + to.height / 2
      const scale = Math.min(1.55, 0.82 + diff / 35)
      const chip: FlyingChip = {
        id: `${Date.now()}-${player.id}-${diff}`,
        amount: diff,
        fromX,
        fromY,
        dx: toX - fromX,
        dy: toY - fromY,
        scale,
        allIn: player.stack === 0,
      }
      setFlyingChips(current => [...current, chip])
      setTimeout(() => {
        setFlyingChips(current => current.filter(item => item.id !== chip.id))
      }, 720)
    }
  }, [state])

  const startPractice = useCallback(() => {
    if (!user) {
      setMessage('로그인 정보를 찾을 수 없습니다.')
      return
    }
    setMode('practice')
    setRemoteState(null)
    setRoomCode('')
    setPracticeState(createPracticeState(user))
    setMessage('연습모드를 시작했습니다.')
  }, [user])

  useEffect(() => {
    if (mode === 'practice' && user && !practiceState && !remoteState) startPractice()
  }, [mode, practiceState, remoteState, startPractice, user])

  useEffect(() => {
    if (mode !== 'practice' || !practiceState) return
    if (practiceState.street === 'select_upcard') {
      const bot = practiceState.players.find(player => player.id === 'bot')
      if (bot && !bot.hand.some(card => card.faceUp)) {
        const timer = setTimeout(() => {
          setPracticeState(current => current ? selectUpcard(current, 'bot', 0) : current)
        }, 450)
        return () => clearTimeout(timer)
      }
    }
    if (practiceState.actorId === 'bot') {
      const timer = setTimeout(() => {
        setPracticeState(current => current ? runBotAction(current) : current)
      }, 650)
      return () => clearTimeout(timer)
    }
  }, [mode, practiceState])

  useEffect(() => {
    if (mode !== 'multi' || !roomCode || !remoteState) return
    if (remoteState.street === 'showdown') return
    const delay = document.visibilityState === 'hidden' ? 12000 : remoteState.actorId === user?.id ? 5000 : 3500
    const timer = setTimeout(() => refreshRoom(), delay)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, roomCode, remoteState?.actorId, remoteState?.street, user?.id])

  async function callPoker(body: Record<string, unknown>) {
    setLoading(true)
    setMessage('')
    try {
      const res = await fetch('/api/poker', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json() as ApiResult
      if (!res.ok) {
        setMessage(data.error ?? '요청에 실패했습니다.')
        return data
      }
      if (data.state) setRemoteState(data.state)
      if (data.roomCode) {
        setRoomCode(data.roomCode)
        setJoinCode(data.roomCode)
      }
      return data
    } finally {
      setLoading(false)
    }
  }

  async function createRoom() {
    setMode('multi')
    setPracticeState(null)
    await callPoker({ action: 'create' })
  }

  async function joinRoom() {
    const code = joinCode.trim()
    if (!code) {
      setMessage('방 코드를 입력해주세요.')
      return
    }
    setMode('multi')
    setPracticeState(null)
    await callPoker({ action: 'join', roomCode: code })
  }

  async function refreshRoom() {
    if (!roomCode) return
    await callPoker({ action: 'state', roomCode })
  }

  async function remoteAction(action: string, extra?: Record<string, unknown>) {
    if (!roomCode) return
    await callPoker({ action, roomCode, ...extra })
  }

  function practiceAction(kind: 'selectUpcard' | 'check' | 'bet' | 'fold', cardIndex?: number, amount?: number) {
    if (!practiceState || !user) return
    try {
      if (kind === 'selectUpcard') setPracticeState(selectUpcard(practiceState, user.id, cardIndex ?? 0))
      if (kind === 'check') setPracticeState(checkOrCall(practiceState, user.id))
      if (kind === 'bet') setPracticeState(bet(practiceState, user.id, amount ?? betAmount))
      if (kind === 'fold') setPracticeState(fold(practiceState, user.id))
      setMessage('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '처리 중 오류가 발생했습니다.')
    }
  }

  function actionButton(kind: 'selectUpcard' | 'check' | 'bet' | 'fold', cardIndex?: number, amount?: number) {
    if (mode === 'practice') return practiceAction(kind, cardIndex, amount)
    if (kind === 'selectUpcard') return remoteAction('selectUpcard', { cardIndex })
    if (kind === 'check') return remoteAction('check')
    if (kind === 'bet') return remoteAction('bet', { amount: amount ?? betAmount })
    return remoteAction('fold')
  }

  async function copyRoomCode() {
    if (!roomCode) return
    await navigator.clipboard.writeText(roomCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  function setQuickBet(amount: number) {
    const max = me?.stack ?? 100
    setBetAmount(Math.max(1, Math.min(max, amount)))
  }

  function allIn() {
    const amount = me?.stack ?? 0
    if (amount <= 0) return
    setBetAmount(amount)
    actionButton('bet', undefined, amount)
  }

  function nextPracticeHand() {
    if (!practiceState || !user) return
    try {
      setPracticeState(startNextHand(practiceState, user.id))
      setMessage('')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '처리 중 오류가 발생했습니다.')
    }
  }

  function newPracticeMatch() {
    if (!practiceState || !user) return startPractice()
    try {
      setPracticeState(startNewMatch(practiceState, user.id))
      setMessage('')
    } catch {
      startPractice()
    }
  }

  async function leavePoker() {
    if (mode === 'multi' && roomCode) {
      await remoteAction('leave')
    }
    router.push('/home/mypage')
  }

  return (
    <div className="page-poker">
      <div className="poker-body">
        <div className="poker-topbar">
          <button className="poker-icon-btn" onClick={leavePoker} title="나가기">
            <ArrowLeft size={19} />
          </button>
          <div>
            <div className="poker-title">포커</div>
            <div className="poker-subtitle">7포커 테스트</div>
          </div>
          <button className="poker-icon-btn" onClick={mode === 'multi' ? refreshRoom : startPractice} title="새로고침">
            <RefreshCw size={18} className={loading ? 'icon-spin' : ''} />
          </button>
        </div>

        <div className="poker-mode-row">
          <button className={`poker-mode${mode === 'practice' ? ' active' : ''}`} onClick={startPractice}>
            <Bot size={16} /> 연습
          </button>
          <button className={`poker-mode${mode === 'multi' ? ' active' : ''}`} onClick={() => setMode('multi')}>
            <Users size={16} /> 멀티
          </button>
        </div>

        {mode === 'multi' && (
          <div className="poker-panel">
            <div className="poker-room-row">
              <button className="poker-primary" onClick={createRoom} disabled={loading}>
                <Play size={16} /> 방 만들기
              </button>
              <div className="poker-join">
                <input
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="1001"
                  inputMode="numeric"
                />
                <button onClick={joinRoom} disabled={loading}>참가</button>
              </div>
            </div>
            {roomCode && (
              <button className="poker-code" onClick={copyRoomCode}>
                방 코드 {roomCode} <Copy size={14} /> {copied ? '복사됨' : ''}
              </button>
            )}
            {roomCode && (
              <button className="poker-leave-room" onClick={leavePoker} disabled={loading}>
                방 나가기
              </button>
            )}
          </div>
        )}

        {message && <div className="poker-message">{message}</div>}

        {state?.matchWinner && (
          <div className="poker-match-winner">
            <div>
              <div className="poker-match-kicker">최종 승자</div>
              <div className="poker-match-name">
                {state.players.find(player => player.id === state.matchWinner)?.name ?? '승자'}
              </div>
            </div>
            <div className="poker-match-actions">
              <button onClick={mode === 'practice' ? newPracticeMatch : () => remoteAction('newMatch')} disabled={mode === 'multi' && !isHost}>
                한판 더하기
              </button>
              <button className="ghost" onClick={leavePoker}>나가기</button>
            </div>
          </div>
        )}

        <div className="poker-table">
          <div className="poker-table-head">
            <div>
              <div className="poker-stage">{stageLabel(state?.street)}</div>
              <div className="poker-pot">덱 {state?.deckCount ?? practiceState?.deck.length ?? 0}</div>
            </div>
            <div className="poker-pot-display" ref={potRef}>
              <ChipStack amount={state?.pot ?? 0} tone="pot" />
            {(state?.showdownSummary || state?.resultText) && <div className="poker-result">{state.showdownSummary || state.resultText}</div>}
            </div>
          </div>

          <div className="poker-players">
            {state?.players.map(player => (
              <div
                key={player.id}
                ref={el => { playerRefs.current[player.id] = el }}
                className={`poker-player${player.id === user?.id ? ' me' : ''}${state.actorId === player.id ? ' turn' : ''}${player.folded ? ' folded' : ''}`}
              >
                <div className="poker-player-head">
                  <div>
                    <div className="poker-player-name">{player.name}{player.id === user?.id ? ' · 나' : ''}</div>
                    <div className="poker-stack-row">
                      <ChipStack amount={player.stack} tone="stack" label="보유" />
                      <ChipStack amount={contributions[player.id] ?? 0} tone="bet" label="베팅" />
                    </div>
                    {state.street === 'showdown' && player.handRank && (
                      <div className={`poker-hand-rank${state.winner === player.id ? ' winner' : player.folded ? ' folded-rank' : ' loser'}`}>
                        {player.handRank}
                      </div>
                    )}
                  </div>
                  {state.actorId === player.id && <span className="poker-turn">차례</span>}
                </div>
                <div className="poker-hand">
                  {player.hand.length === 0 ? (
                    <div className="poker-empty-hand">대기 중</div>
                  ) : player.hand.map((card, idx) => (
                    <button
                      key={`${player.id}-${idx}`}
                      className={`poker-card${card.card === '??' ? ' back' : ''}${isRedCard(card.card) ? ' red' : ''}${isRankCard(player, card.card) ? ' rank-card' : ''}${state.winner === player.id && isRankCard(player, card.card) ? ' winner-rank-card' : ''}`}
                      disabled={player.id !== user?.id || !canPickUpcard}
                      onClick={() => actionButton('selectUpcard', idx)}
                    >
                      {formatCard(card.card)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {!state && <div className="poker-empty-table"><Spade size={26} /> 포커 테이블을 준비 중입니다.</div>}
          </div>
        </div>

        <div className="poker-actions">
          {mode === 'multi' && state?.street === 'waiting' && isHost && (
            <button className="poker-primary" onClick={() => remoteAction('start')} disabled={loading || (state.players.length < 2)}>
              <Play size={16} /> 시작
            </button>
          )}
          {state?.street === 'waiting' && !isHost && mode === 'multi' && (
            <div className="poker-help">방장이 시작할 때까지 기다려주세요.</div>
          )}
          {state?.street === 'select_upcard' && canPickUpcard && (
            <div className="poker-help">내 카드 중 공개할 카드 1장을 선택하세요.</div>
          )}
          {state && state.street !== 'waiting' && state.street !== 'select_upcard' && state.street !== 'showdown' && (
            <>
              <div className="poker-bet-panel">
                <div className="poker-bet-input-row">
                  <input
                    type="number"
                    min={1}
                    max={me?.stack ?? 100}
                    value={betAmount}
                    onChange={e => setQuickBet(Number(e.target.value))}
                    disabled={!isMyTurn || loading}
                  />
                  <button onClick={allIn} disabled={!isMyTurn || loading || !me || me.stack <= 0}>올인</button>
                </div>
                <div className="poker-bet-quick">
                  {[1, 5, 10, 20].map(amount => (
                    <button key={amount} onClick={() => setQuickBet(amount)} disabled={!isMyTurn || loading || (me?.stack ?? 0) < amount}>
                      {amount}
                    </button>
                  ))}
                </div>
              </div>
              <button className="poker-action" onClick={() => actionButton('check')} disabled={!isMyTurn || loading}>
                <Check size={16} /> {actionLabel}
              </button>
              <button className="poker-action strong" onClick={() => actionButton('bet', undefined, betAmount)} disabled={!isMyTurn || loading || !me || me.stack <= 0}>
                {betLabel}
              </button>
              <button className="poker-action danger" onClick={() => actionButton('fold')} disabled={!isMyTurn || loading}>
                폴드
              </button>
            </>
          )}
          {state?.street === 'showdown' && !state.matchWinner && (
            <button className="poker-action" onClick={mode === 'practice' ? nextPracticeHand : () => remoteAction('nextHand')} disabled={mode === 'multi' && !isHost}>
              <RotateCcw size={16} /> 다음 판
            </button>
          )}
          {state?.street === 'showdown' && mode === 'multi' && !isHost && !state.matchWinner && (
            <div className="poker-help">방장이 다음 판을 시작할 수 있습니다.</div>
          )}
          {state?.street === 'showdown' && mode === 'multi' && !isHost && state.matchWinner && (
            <div className="poker-help">방장이 새 게임을 시작할 수 있습니다.</div>
          )}
        </div>
      </div>

      <div className="flying-chip-layer" aria-hidden="true">
        {flyingChips.map(chip => (
          <div
            key={chip.id}
            className={`flying-chip${chip.allIn ? ' all-in' : ''}`}
            style={{
              left: chip.fromX,
              top: chip.fromY,
              '--fly-dx': `${chip.dx}px`,
              '--fly-dy': `${chip.dy}px`,
              '--fly-scale': chip.scale,
            } as React.CSSProperties}
          >
            <div className="flying-chip-pile"><span /><span /><span /></div>
            <strong>{chip.allIn ? 'ALL IN' : `+${chip.amount}`}</strong>
          </div>
        ))}
      </div>
    </div>
  )
}

function stageLabel(street?: string) {
  if (!street) return '준비'
  if (street === 'waiting') return '대기방'
  if (street === 'select_upcard') return '공개 카드 선택'
  if (street === 'showdown') return '쇼다운'
  return '베팅'
}

function formatCard(card: string) {
  if (card === '??') return '??'
  const rank = card.slice(0, 1).replace('T', '10')
  const suit = cardSuit[card.slice(1, 2)] ?? ''
  return `${rank}${suit}`
}

function isRedCard(card: string) {
  return card.endsWith('H') || card.endsWith('D')
}

function isRankCard(player: { handRankCards?: string[] }, card: string) {
  return card !== '??' && Boolean(player.handRankCards?.includes(card))
}

function runBotAction(state: PokerState) {
  const bot = state.players.find(player => player.id === 'bot')
  if (!bot || bot.stack <= 0) return checkOrCall(state, 'bot')

  const visibleScore = Math.max(
    0,
    ...bot.hand
      .filter(card => card.faceUp)
      .map(card => cardPower(card.card))
  )
  const lateStreet = state.street === 'seven_6th_bet' || state.street === 'seven_7th_bet'
  const confidence = visibleScore >= 11 ? 0.65 : visibleScore >= 8 ? 0.42 : 0.24
  const roll = Math.random()

  if (lateStreet && bot.stack <= 25 && roll < 0.18) {
    return bet(state, 'bot', bot.stack)
  }
  if (roll < confidence) {
    const base = visibleScore >= 11 ? 12 : visibleScore >= 8 ? 7 : 3
    const swing = Math.floor(Math.random() * (lateStreet ? 10 : 5))
    return bet(state, 'bot', Math.min(bot.stack, base + swing))
  }
  if (lateStreet && roll > 0.94) {
    return bet(state, 'bot', Math.min(bot.stack, 20))
  }
  return checkOrCall(state, 'bot')
}

function cardPower(card: string) {
  const rank = card.slice(0, 1)
  return ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'].indexOf(rank)
}

function ChipStack({ amount, tone, label }: { amount: number; tone: 'stack' | 'bet' | 'pot'; label?: string }) {
  return (
    <div className={`chip-stack ${tone}`}>
      <div className="chip-pile" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div>
        {label && <div className="chip-label">{label}</div>}
        <div className="chip-amount">{amount}</div>
      </div>
    </div>
  )
}
