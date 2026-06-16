'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Bot, Check, Crown, Play, RefreshCw, RotateCcw, Spade, Users } from 'lucide-react'
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
  rooms?: PokerRoomSummary[]
  error?: string
  conflict?: boolean
}

type PokerRoomSummary = {
  roomCode: string
  label: string
  players: number
  maxPlayers: number
  street: string
  hostName: string | null
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
  kind?: 'bet' | 'payout'
}

type FlyingDealCard = {
  id: string
  fromX: number
  fromY: number
  dx: number
  dy: number
  delay: number
}

type ActionToast = {
  id: string
  playerId: string
  label: string
  kind: 'bet' | 'raise' | 'call' | 'check' | 'fold'
}

type DealtCard = {
  id: string
  playerId: string
  delay: number
}

const cardSuit: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣' }

export default function PokerPage() {
  const router = useRouter()
  const [user, setUser] = useState<UserInfo | null>(null)
  const [mode, setMode] = useState<'practice' | 'multi'>('practice')
  const [practiceState, setPracticeState] = useState<PokerState | null>(null)
  const [remoteState, setRemoteState] = useState<PublicPokerState | null>(null)
  const [roomCode, setRoomCode] = useState('')
  const [rooms, setRooms] = useState<PokerRoomSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState(false)
  const [betAmount, setBetAmount] = useState(5)
  const [refreshIn, setRefreshIn] = useState<number | null>(null)
  const [flyingChips, setFlyingChips] = useState<FlyingChip[]>([])
  const [flyingDealCards, setFlyingDealCards] = useState<FlyingDealCard[]>([])
  const [actionToasts, setActionToasts] = useState<ActionToast[]>([])
  const [dealtCards, setDealtCards] = useState<DealtCard[]>([])
  const [celebratingWinner, setCelebratingWinner] = useState<string | null>(null)
  const playerRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const potRef = useRef<HTMLDivElement | null>(null)
  const previousState = useRef<PublicPokerState | null>(null)
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
  const potContributions = state?.potContributions ?? contributions
  const me = state?.players.find(player => player.id === user?.id)
  const opponents = state?.players.filter(player => player.id !== user?.id) ?? []
  const myHandHint = me ? getHandHint(me.hand.map(card => card.card).filter(card => card !== '??')) : null
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
      previousState.current = state
      setCelebratingWinner(null)
      return
    }
    if (state.street !== 'showdown') setCelebratingWinner(null)

    const previousSnapshot = previousState.current
    showActionChanges(previousSnapshot, state)
    previousState.current = state

    const previous = previousContributions.current
    const next = state.contributions ?? {}
    previousContributions.current = next
    if (!previous || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const handledLastChip = state.lastAction
      && previousSnapshot?.lastAction?.id !== state.lastAction.id
      && isChipAction(state.lastAction.kind)
      && (state.lastAction.amount ?? 0) > 0
    if (handledLastChip) return

    for (const player of state.players) {
      const before = previous[player.id] ?? 0
      const after = next[player.id] ?? 0
      const diff = after - before
      if (diff <= 0) continue

      flyChipToPot(player.id, diff, player.stack === 0)
    }
  }, [state])

  function showActionChanges(previous: PublicPokerState | null, next: PublicPokerState) {
    if (!previous) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    queueDealtCards(previous, next)
    showPayoutAnimation(previous, next)
    const lastAction = next.lastAction
    if (lastAction && previous.lastAction?.id !== lastAction.id) {
      if (isChipAction(lastAction.kind)) {
        const actor = next.players.find(player => player.id === lastAction.playerId)
        if ((lastAction.amount ?? 0) > 0) flyChipToPot(lastAction.playerId, lastAction.amount ?? 0, actor?.stack === 0)
      } else {
        pushActionToast(lastAction.playerId, lastAction.label, lastAction.kind)
      }
      return
    }
    if (previous.street !== next.street) return

    for (const player of next.players) {
      const beforePlayer = previous.players.find(item => item.id === player.id)
      if (!beforePlayer) continue

      if (!beforePlayer.folded && player.folded) {
        pushActionToast(player.id, '폴드', 'fold')
        continue
      }

      const beforeContribution = previous.contributions[player.id] ?? 0
      const afterContribution = next.contributions[player.id] ?? 0
      const diff = afterContribution - beforeContribution
      if (diff <= 0) continue
    }

    const previousActor = previous.actorId
    if (previousActor && previousActor !== next.actorId) {
      const beforeContribution = previous.contributions[previousActor] ?? 0
      const afterContribution = next.contributions[previousActor] ?? 0
      const beforeFolded = previous.players.find(player => player.id === previousActor)?.folded
      const afterFolded = next.players.find(player => player.id === previousActor)?.folded
      if (beforeContribution === afterContribution && !beforeFolded && !afterFolded) {
        pushActionToast(previousActor, '체크', 'check')
      }
    }
  }

  function showPayoutAnimation(previous: PublicPokerState, next: PublicPokerState) {
    if (previous.street === 'showdown' || next.street !== 'showdown' || !next.winner) return
    const fromEl = potRef.current
    const toEl = playerRefs.current[next.winner]
    if (!fromEl || !toEl) return

    const from = fromEl.getBoundingClientRect()
    const to = toEl.getBoundingClientRect()
    const fromX = from.left + from.width / 2
    const fromY = from.top + from.height / 2
    const toX = to.left + to.width / 2
    const toY = to.top + Math.min(to.height - 24, 82)
    const amount = Math.max(previous.pot, Object.values(previous.potContributions ?? {}).reduce((sum, value) => sum + value, 0))
    setTimeout(() => {
      setCelebratingWinner(next.winner)
      if (amount > 0) {
        const chip: FlyingChip = {
          id: `${Date.now()}-payout-${next.winner}`,
          amount,
          fromX,
          fromY,
          dx: toX - fromX,
          dy: toY - fromY,
          scale: Math.min(1.8, 1 + amount / 70),
          allIn: false,
          kind: 'payout',
        }
        setFlyingChips(current => [...current, chip])
        setTimeout(() => {
          setFlyingChips(current => current.filter(item => item.id !== chip.id))
        }, 980)
      }
    }, 1350)
  }

  function queueDealtCards(previous: PublicPokerState, next: PublicPokerState) {
    const cards: DealtCard[] = []
    const flyingCards: FlyingDealCard[] = []
    const fromEl = potRef.current
    const from = fromEl?.getBoundingClientRect()
    const fromX = from ? from.left + from.width / 2 : window.innerWidth / 2
    const fromY = from ? from.top + from.height / 2 : window.innerHeight / 2
    let dealIndex = 0
    for (const player of next.players) {
      const beforePlayer = previous.players.find(item => item.id === player.id)
      const beforeCount = beforePlayer?.hand.length ?? 0
      const target = playerRefs.current[player.id]?.getBoundingClientRect()
      for (let idx = beforeCount; idx < player.hand.length; idx += 1) {
        const delay = dealIndex * 90
        const id = getCardKey(player.id, idx, player.hand[idx]?.card ?? '??')
        cards.push({ id, playerId: player.id, delay })
        if (target) {
          const toX = target.left + Math.min(target.width - 22, 24 + idx * 42)
          const toY = target.top + target.height - 38
          flyingCards.push({
            id: `${Date.now()}-deal-${id}`,
            fromX,
            fromY,
            dx: toX - fromX,
            dy: toY - fromY,
            delay,
          })
        }
        dealIndex += 1
      }
    }
    if (cards.length === 0) return
    setDealtCards(current => [...current, ...cards])
    if (flyingCards.length > 0) setFlyingDealCards(current => [...current, ...flyingCards])
    setTimeout(() => {
      setDealtCards(current => current.filter(item => !cards.some(card => card.id === item.id)))
      setFlyingDealCards(current => current.filter(item => !flyingCards.some(card => card.id === item.id)))
    }, 1100 + dealIndex * 90)
  }

  function pushActionToast(playerId: string, label: string, kind: ActionToast['kind']) {
    const toast: ActionToast = { id: `${Date.now()}-${playerId}-${label}`, playerId, label, kind }
    setActionToasts(current => [...current.filter(item => item.playerId !== playerId), toast])
    setTimeout(() => {
      setActionToasts(current => current.filter(item => item.id !== toast.id))
    }, 1100)
  }

  function flyChipToPot(playerId: string, amount: number, allIn = false) {
    if (amount <= 0) return
    const fromEl = playerRefs.current[playerId]
    const toEl = potRef.current
    if (!fromEl || !toEl) return

    const from = fromEl.getBoundingClientRect()
    const to = toEl.getBoundingClientRect()
    const fromX = from.left + from.width / 2
    const fromY = from.top + Math.min(from.height - 28, 72)
    const toX = to.left + to.width / 2
    const toY = to.top + to.height / 2
    const chip: FlyingChip = {
      id: `${Date.now()}-${playerId}-${amount}`,
      amount,
      fromX,
      fromY,
      dx: toX - fromX,
      dy: toY - fromY,
      scale: Math.min(1.55, 0.82 + amount / 35),
      allIn,
    }
    setFlyingChips(current => [...current, chip])
    setTimeout(() => {
      setFlyingChips(current => current.filter(item => item.id !== chip.id))
    }, 720)
  }

  function isChipAction(kind: ActionToast['kind']) {
    return kind === 'bet' || kind === 'raise' || kind === 'call'
  }

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
    if (mode !== 'multi' || !roomCode || !remoteState) {
      setRefreshIn(null)
      return
    }
    if (document.visibilityState === 'hidden') {
      setRefreshIn(null)
      return
    }
    if (remoteState.actorId === user?.id) {
      setRefreshIn(null)
      return
    }
    const delay = remoteState.street === 'waiting'
      ? 5000
      : remoteState.street === 'showdown'
        ? 5000
        : 3000
    setRefreshIn(Math.ceil(delay / 1000))
    const timer = setTimeout(() => refreshRoom(), delay)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, roomCode, remoteState, user?.id])

  useEffect(() => {
    if (refreshIn == null || refreshIn <= 0) return
    const timer = setTimeout(() => setRefreshIn(value => value == null ? null : Math.max(0, value - 1)), 1000)
    return () => clearTimeout(timer)
  }, [refreshIn])

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
      }
      if (data.rooms) setRooms(data.rooms)
      return data
    } finally {
      setLoading(false)
    }
  }

  async function loadRooms() {
    await callPoker({ action: 'rooms' })
  }

  async function enterTable(code: string) {
    setMode('multi')
    setPracticeState(null)
    await callPoker({ action: 'join', roomCode: code })
  }

  async function reclaimTable(code: string) {
    setMode('multi')
    setPracticeState(null)
    setRoomCode(code)
    await callPoker({ action: 'reclaim', roomCode: code })
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

  useEffect(() => {
    if (mode !== 'multi' || roomCode) return
    loadRooms()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, roomCode])

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
          <button className="poker-icon-btn" onClick={mode === 'multi' ? (roomCode ? refreshRoom : loadRooms) : startPractice} title="새로고침">
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
            {!roomCode && (
              <div className="poker-table-list">
                {rooms.length === 0 && (
                  <button className="poker-primary" onClick={loadRooms} disabled={loading}>
                    <RefreshCw size={16} /> 테이블 불러오기
                  </button>
                )}
                {rooms.map(room => (
                  <div key={room.roomCode} className="poker-table-card">
                    <div className="poker-table-felt">
                      <div className="poker-seat s1" />
                      <div className="poker-seat s2" />
                      <div className="poker-seat s3" />
                      <div className="poker-seat s4" />
                      <div className="poker-table-center">
                        <div className="poker-table-card-title">{room.label}</div>
                        <div className={`poker-table-status ${room.street}`}>{roomStatus(room.street)}</div>
                      </div>
                    </div>
                    <div className="poker-table-card-side">
                      <div className="poker-table-card-meta">
                        <strong>{room.players}/{room.maxPlayers}</strong>
                        <span>{room.hostName ? `방장 ${room.hostName}` : '빈 테이블'}</span>
                      </div>
                      <button
                        onClick={() => room.street === 'showdown' && room.players <= 1 ? reclaimTable(room.roomCode) : enterTable(room.roomCode)}
                        disabled={loading || room.players >= room.maxPlayers || (room.street !== 'waiting' && !(room.street === 'showdown' && room.players <= 1))}
                      >
                        {room.street === 'showdown' && room.players <= 1 ? '정리 후 입장' : '입장'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {roomCode && (
              <div className="poker-code">
                {roomCode === '1001' ? '1번 테이블' : '2번 테이블'} · {copied ? '복사됨' : '멀티'}
              </div>
            )}
            {roomCode && (
              <button className="poker-leave-room" onClick={leavePoker} disabled={loading}>
                방 나가기
              </button>
            )}
          </div>
        )}

        {message && <div className="poker-message">{message}</div>}

        {mode === 'multi' && roomCode && refreshIn != null && (
          <div className="poker-refresh-hint">
            {refreshIn > 0 ? `${refreshIn}초 후 자동 새로고침` : '새로고침 중...'}
          </div>
        )}

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
            </div>
          </div>

          <div className="poker-players">
            {state && opponents.map(player => (
              <div
                key={player.id}
                ref={el => { playerRefs.current[player.id] = el }}
                className={`poker-player${player.id === user?.id ? ' me' : ''}${state.actorId === player.id ? ' turn' : ''}${player.folded ? ' folded' : ''}`}
              >
                <div className="poker-player-head">
                  {actionToasts.filter(toast => toast.playerId === player.id).map(toast => (
                    <div key={toast.id} className={`poker-action-toast ${toast.kind}`}>{toast.label}</div>
                  ))}
                  <div>
                    <div className="poker-player-name">
                      {player.name}{player.id === user?.id ? ' · 나' : ''}
                      {state.hostId === player.id && <span className="poker-host-badge"><Crown size={11} /> 방장</span>}
                    </div>
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
                  ) : player.hand.map((card, idx) => {
                    const dealtCard = dealtCards.find(item => item.id === getCardKey(player.id, idx, card.card))
                    return (
                      <button
                        key={`${player.id}-${idx}`}
                        className={`poker-card${card.card === '??' ? ' back' : ''}${isRedCard(card.card) ? ' red' : ''}${card.isDoorCard ? ' door-card' : ''}${dealtCard ? ' dealt-card' : ''}${isRankCard(player, card.card) ? ' rank-card' : ''}${state.winner === player.id && isRankCard(player, card.card) ? ' winner-rank-card' : ''}${state.winner === player.id && celebratingWinner === player.id && isRankCard(player, card.card) ? ' celebrate-card' : ''}`}
                        style={dealtCard ? { '--deal-delay': `${dealtCard.delay}ms` } as React.CSSProperties : undefined}
                        disabled={player.id !== user?.id || !canPickUpcard}
                        onClick={() => actionButton('selectUpcard', idx)}
                      >
                        {formatCard(card.card)}
                        {card.isDoorCard && <span className="poker-card-badge">첫 공개</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            {!state && <div className="poker-empty-table"><Spade size={26} /> 포커 테이블을 준비 중입니다.</div>}
          </div>
        </div>

        {state && (
          <div className="poker-pot-bar" ref={potRef}>
            <div>
              <div className="poker-pot-label">총 팟</div>
              <ChipStack amount={state.pot} tone="pot" />
            </div>
            <div className="poker-pot-contributions">
              {state.players
                .filter(player => (potContributions[player.id] ?? 0) > 0)
                .map(player => (
                  <div key={player.id} className={`poker-pot-contribution${player.id === user?.id ? ' me' : ''}`}>
                    <span>{player.id === user?.id ? '나' : player.name}</span>
                    <strong>{potContributions[player.id]}</strong>
                  </div>
                ))}
            </div>
            <div className="poker-current-bet">
              <span>라운드 기준</span>
              <strong>{state.currentBet > 0 ? state.currentBet : '-'}</strong>
            </div>
            {(state.showdownSummary || state.resultText) && (
              <div className="poker-result">{state.showdownSummary || state.resultText}</div>
            )}
          </div>
        )}

        {state && me && (
          <div
            ref={el => { playerRefs.current[me.id] = el }}
            className={`poker-my-panel${state.actorId === me.id ? ' turn' : ''}${me.folded ? ' folded' : ''}`}
          >
            <div className="poker-player-head">
              {actionToasts.filter(toast => toast.playerId === me.id).map(toast => (
                <div key={toast.id} className={`poker-action-toast ${toast.kind}`}>{toast.label}</div>
              ))}
              <div>
                <div className="poker-player-name">
                  {me.name} · 나
                  {state.hostId === me.id && <span className="poker-host-badge"><Crown size={11} /> 방장</span>}
                </div>
                <div className="poker-stack-row">
                  <ChipStack amount={me.stack} tone="stack" label="보유" />
                  <ChipStack amount={contributions[me.id] ?? 0} tone="bet" label="베팅" />
                </div>
                {myHandHint && <div className="poker-hand-hint">{myHandHint}</div>}
                {state.street === 'showdown' && me.handRank && (
                  <div className={`poker-hand-rank${state.winner === me.id ? ' winner' : me.folded ? ' folded-rank' : ' loser'}`}>
                    {me.handRank}
                  </div>
                )}
              </div>
              {state.actorId === me.id && <span className="poker-turn">차례</span>}
            </div>
            <div className="poker-hand my-hand">
              {me.hand.length === 0 ? (
                <div className="poker-empty-hand">대기 중</div>
              ) : me.hand.map((card, idx) => {
                const dealtCard = dealtCards.find(item => item.id === getCardKey(me.id, idx, card.card))
                return (
                  <button
                    key={`${me.id}-${idx}`}
                    className={`poker-card${card.card === '??' ? ' back' : ''}${isRedCard(card.card) ? ' red' : ''}${card.isDoorCard ? ' door-card' : ''}${dealtCard ? ' dealt-card' : ''}${isRankCard(me, card.card) ? ' rank-card' : ''}${state.winner === me.id && isRankCard(me, card.card) ? ' winner-rank-card' : ''}${state.winner === me.id && celebratingWinner === me.id && isRankCard(me, card.card) ? ' celebrate-card' : ''}`}
                    style={dealtCard ? { '--deal-delay': `${dealtCard.delay}ms` } as React.CSSProperties : undefined}
                    disabled={!canPickUpcard}
                    onClick={() => actionButton('selectUpcard', idx)}
                  >
                    {formatCard(card.card)}
                    {card.isDoorCard && <span className="poker-card-badge">첫 공개</span>}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        <div className="poker-actions">
          {mode === 'multi' && state?.street === 'waiting' && isHost && (
            <button className="poker-primary" onClick={() => remoteAction('start')} disabled={loading || (state.players.length < 2)}>
              <Play size={16} /> 시작
            </button>
          )}
          {state?.street === 'waiting' && !isHost && mode === 'multi' && (
            <>
              <div className="poker-help">방장이 시작할 때까지 기다려주세요.</div>
              <button className="poker-action" onClick={() => remoteAction('reclaim')} disabled={loading}>
                테이블 정리
              </button>
            </>
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
            className={`flying-chip${chip.allIn ? ' all-in' : ''}${chip.kind === 'payout' ? ' payout' : ''}`}
            style={{
              left: chip.fromX,
              top: chip.fromY,
              '--fly-dx': `${chip.dx}px`,
              '--fly-dy': `${chip.dy}px`,
              '--fly-scale': chip.scale,
            } as React.CSSProperties}
          >
            <div className="flying-chip-pile"><span /><span /><span /></div>
            <strong>{chip.kind === 'payout' ? `WIN +${chip.amount}` : chip.allIn ? 'ALL IN' : `+${chip.amount}`}</strong>
          </div>
        ))}
        {flyingDealCards.map(card => (
          <div
            key={card.id}
            className="flying-deal-card"
            style={{
              left: card.fromX,
              top: card.fromY,
              '--fly-dx': `${card.dx}px`,
              '--fly-dy': `${card.dy}px`,
              '--fly-delay': `${card.delay}ms`,
            } as React.CSSProperties}
          />
        ))}
      </div>
    </div>
  )
}

function getCardKey(playerId: string, index: number, card: string) {
  return `${playerId}-${index}-${card}`
}

function stageLabel(street?: string) {
  if (!street) return '준비'
  if (street === 'waiting') return '대기방'
  if (street === 'select_upcard') return '공개 카드 선택'
  if (street === 'showdown') return '쇼다운'
  return '베팅'
}

function roomStatus(street: string) {
  if (street === 'waiting') return '대기중'
  if (street === 'showdown') return '결과 확인'
  return '진행중'
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

function getHandHint(cards: string[]) {
  if (cards.length === 0) return null
  const ranks = cards.map(card => card.slice(0, 1))
  const suits = cards.map(card => card.slice(1, 2))
  const rankCounts = countBy(ranks)
  const suitCounts = countBy(suits)
  const counts = [...rankCounts.values()].sort((a, b) => b - a)
  const pairs = counts.filter(count => count === 2).length
  const triples = counts.filter(count => count === 3).length
  const quads = counts.filter(count => count === 4).length
  const flushCount = Math.max(...suitCounts.values())
  const straightRun = longestStraightRun(ranks)

  const made =
    quads ? '포카드 완성' :
    triples && pairs ? '풀하우스 완성' :
    flushCount >= 5 ? '플러시 완성' :
    straightRun >= 5 ? '스트레이트 완성' :
    triples ? '트리플 완성' :
    pairs >= 2 ? '투페어 완성' :
    pairs === 1 ? '원페어 완성' :
    '하이카드'

  const draws: string[] = []
  if (flushCount === 4) draws.push('플러시 4장')
  if (straightRun === 4) draws.push('스트레이트 4연결')
  if (counts[0] === 2 && cards.length < 7) draws.push('트리플 가능')
  if (counts[0] === 3 && cards.length < 7) draws.push('풀하우스 가능')

  return draws.length > 0 ? `${made} · ${draws.join(' · ')}` : made
}

function countBy(values: string[]) {
  const map = new Map<string, number>()
  for (const value of values) map.set(value, (map.get(value) ?? 0) + 1)
  return map
}

function longestStraightRun(ranks: string[]) {
  const values = [...new Set(ranks.map(rank => '23456789TJQKA'.indexOf(rank) + 2).filter(value => value >= 2))].sort((a, b) => a - b)
  if (values.includes(14)) values.unshift(1)
  let best = 0
  let current = 0
  let previous = -99
  for (const value of values) {
    current = value === previous + 1 ? current + 1 : 1
    best = Math.max(best, current)
    previous = value
  }
  return best
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
