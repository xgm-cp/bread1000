'use client'
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useBreadEngine, GRID_SIZE, WIN_SCORE, MAX_MOVES, type Particle } from './useBreadEngine'

// 앱 테마 토큰
const T = {
  bg:       '#0A0C0F',
  surface:  '#111418',
  surface2: '#181C22',
  border:   '#1E2430',
  border2:  '#252D3A',
  text:     '#EEF0F4',
  text2:    '#8892A0',
  text3:    '#4A5568',
  gold:     '#FF3D78',
  gradient: 'linear-gradient(135deg, #FF3D78, #9B2FC9)',
  up:       '#FF5C5C',
  accent:   '#4A9EFF',
  neonY:    '#FFD700',
  neonO:    '#FF8C00',
}

const SPECIAL_LABEL: Record<string, { icon: string; bg: string; color: string }> = {
  'striped-h': { icon: '⚡', bg: '#0EA5E9', color: '#fff' },
  'striped-v': { icon: '⚡', bg: '#7C3AED', color: '#fff' },
  'bomb':      { icon: '💥', bg: '#FF3D78', color: '#fff' },
}

const COMBO_NEON = ['', T.neonO, '#FF3D78', '#9B2FC9', '#00D4FF', '#FFD700']
const COMBO_SIZE = [14, 16, 19, 22, 26, 30]

function ParticleLayer({ particles }: { particles: Particle[] }) {
  const pct = 100 / GRID_SIZE
  return (
    <AnimatePresence>
      {particles.map(p => (
        <motion.div
          key={p.id}
          style={{
            position: 'absolute',
            left: `${(p.c + 0.5) * pct}%`,
            top:  `${(p.r + 0.5) * pct}%`,
            pointerEvents: 'none',
            zIndex: 50,
          }}
          initial={{ opacity: 1, x: 0, y: 0, scale: 1.2 }}
          animate={{ opacity: 0, x: p.dx, y: p.dy, scale: 0 }}
          transition={{ duration: 0.65, ease: 'easeOut' }}
        >
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: p.color,
            boxShadow: `0 0 8px 2px ${p.color}`,
          }} />
        </motion.div>
      ))}
    </AnimatePresence>
  )
}

export default function BreadMatch3({ onClose }: { onClose: () => void }) {
  const {
    grid, score, combo, movesLeft, isProcessing,
    gameState, lastMatchPos, particles,
    handleSwap, initBoard,
  } = useBreadEngine()

  const MAX_ROUNDS = 10

  const [showExitConfirm, setShowExitConfirm] = useState(false)
  const [selectedCell, setSelectedCell] = useState<{ r: number; c: number } | null>(null)
  const [dragStart, setDragStart] = useState<{ r: number; c: number; x: number; y: number } | null>(null)
  const [swappingPair, setSwappingPair] = useState<{ from: { r: number; c: number }; to: { r: number; c: number } } | null>(null)
  const [currentRound, setCurrentRound] = useState(1)
  const [bestScore, setBestScore] = useState(0)
  const [showFinal, setShowFinal] = useState(false) // 10판 완료 화면

  const scoreRef = useRef(0)
  scoreRef.current = score

  // 게임 종료 시 최고점수 갱신
  useEffect(() => {
    if (gameState !== 'playing') {
      setBestScore(prev => Math.max(prev, scoreRef.current))
    }
  }, [gameState])

  // 뒤로가기 감지
  useEffect(() => {
    window.history.pushState({ match3: true }, '')
    const onPop = () => setShowExitConfirm(true)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  function confirmExit() {
    setShowExitConfirm(false)
    onClose()
  }

  function cancelExit() {
    setShowExitConfirm(false)
    window.history.pushState({ match3: true }, '')
  }

  const resetAll = async () => {
    setCurrentRound(1)
    setBestScore(0)
    setShowFinal(false)
    setSelectedCell(null)
    setSwappingPair(null)
    await initBoard()
  }

  const goNextRound = async () => {
    const next = currentRound + 1
    if (next > MAX_ROUNDS) {
      setShowFinal(true)
      return
    }
    setCurrentRound(next)
    setSelectedCell(null)
    setSwappingPair(null)
    await initBoard()
  }

  const GAP = 3 // 그리드 gap(px), useBreadEngine와 동일

  const runSwapAnim = async (r1: number, c1: number, r2: number, c2: number) => {
    setSwappingPair({ from: { r: r1, c: c1 }, to: { r: r2, c: c2 } })
    await new Promise(res => setTimeout(res, 270))
    setSwappingPair(null)
  }

  const handleCellTap = async (r: number, c: number) => {
    if (isProcessing || gameState !== 'playing') return
    if (!selectedCell) { setSelectedCell({ r, c }); return }
    const { r: pr, c: pc } = selectedCell
    const isNeighbor =
      (Math.abs(r - pr) === 1 && c === pc) ||
      (Math.abs(c - pc) === 1 && r === pr)
    if (!isNeighbor) { setSelectedCell({ r, c }); return }
    setSelectedCell(null)
    await runSwapAnim(pr, pc, r, c)
    await handleSwap(pr, pc, r, c)
  }

  const handlePointerDown = (r: number, c: number, e: React.PointerEvent) => {
    if (isProcessing || gameState !== 'playing') return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragStart({ r, c, x: e.clientX, y: e.clientY })
  }

  const handlePointerUp = async (r: number, c: number, e: React.PointerEvent) => {
    if (!dragStart || isProcessing || gameState !== 'playing') { setDragStart(null); return }
    const dx = e.clientX - dragStart.x
    const dy = e.clientY - dragStart.y
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist < 8) {
      await handleCellTap(r, c)
      setDragStart(null)
      return
    }

    let dr = 0, dc = 0
    if (Math.abs(dx) > Math.abs(dy)) dc = dx > 0 ? 1 : -1
    else dr = dy > 0 ? 1 : -1

    const tr = dragStart.r + dr
    const tc = dragStart.c + dc
    if (tr >= 0 && tr < GRID_SIZE && tc >= 0 && tc < GRID_SIZE) {
      setSelectedCell(null)
      await runSwapAnim(dragStart.r, dragStart.c, tr, tc)
      await handleSwap(dragStart.r, dragStart.c, tr, tc)
    }
    setDragStart(null)
  }

  const comboIdx  = Math.min(combo, COMBO_NEON.length - 1)
  const comboColor = COMBO_NEON[comboIdx] || T.neonO
  const comboFs    = COMBO_SIZE[comboIdx] || 30
  const movePct    = movesLeft / MAX_MOVES
  const barColor   = movesLeft > 10 ? '#22C55E' : movesLeft > 5 ? T.neonO : T.up
  const scorePct   = Math.min(score / WIN_SCORE, 1)

  return (
    /* 전체 오버레이 */
    <div
      onClick={() => setSelectedCell(null)}
      style={{
        position: 'fixed', inset: 0, zIndex: 500,
        background: 'rgba(0,0,0,0.88)',
        backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 12,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 420,
          background: T.bg,
          borderRadius: 24,
          overflow: 'hidden',
          border: `1px solid ${T.border}`,
          boxShadow: '0 40px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04)',
        }}
      >

        {/* ── 헤더 ─────────────────────────────── */}
        <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: '14px 18px 12px' }}>

          {/* 타이틀 행 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* 제목 + 판수 + 최고점수 한 줄 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 18 }}>🍞</span>
                <span style={{
                  fontSize: 16, fontWeight: 800, letterSpacing: '-0.4px',
                  background: T.gradient,
                  WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
                  whiteSpace: 'nowrap',
                }}>
                  Bread Match-3
                </span>

                {/* 판수 뱃지 */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 3,
                  background: 'rgba(155,47,201,0.18)',
                  border: '1px solid rgba(155,47,201,0.4)',
                  borderRadius: 6, padding: '2px 7px',
                }}>
                  <span style={{ fontSize: 9, color: '#C084FC', fontWeight: 700, letterSpacing: '0.06em' }}>판</span>
                  <span style={{ fontSize: 12, fontWeight: 900, color: '#E9D5FF', lineHeight: 1 }}>
                    {currentRound}
                  </span>
                  <span style={{ fontSize: 9, color: '#7C3AED', fontWeight: 600 }}>/{MAX_ROUNDS}</span>
                </div>

                {/* 최고점수 뱃지 */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 3,
                  background: 'rgba(255,215,0,0.10)',
                  border: '1px solid rgba(255,215,0,0.3)',
                  borderRadius: 6, padding: '2px 7px',
                }}>
                  <span style={{ fontSize: 9, color: '#A8840E', fontWeight: 700 }}>최고</span>
                  <span style={{
                    fontSize: 12, fontWeight: 900, lineHeight: 1,
                    color: T.neonY,
                    textShadow: bestScore > 0 ? `0 0 8px rgba(255,215,0,0.5)` : 'none',
                  }}>
                    {bestScore > 0 ? bestScore.toLocaleString() : '-'}
                  </span>
                </div>
              </div>

              <div style={{ fontSize: 10, color: T.text3, marginTop: 3, letterSpacing: '0.07em' }}>
                3개 이상 연결해 터뜨려요
              </div>
            </div>
            <button
              onClick={() => setShowExitConfirm(true)}
              style={{
                flexShrink: 0,
                background: T.surface2, border: `1px solid ${T.border2}`,
                borderRadius: 10, color: T.text2,
                fontWeight: 700, fontSize: 13, cursor: 'pointer',
                padding: '7px 13px', fontFamily: 'inherit', marginLeft: 8,
              }}
            >✕ 닫기</button>

          </div>

          {/* 스탯 행 */}
          <div style={{ display: 'flex', gap: 8 }}>

            {/* 점수 */}
            <div style={{
              flex: 1, background: T.surface2, borderRadius: 12,
              padding: '10px 13px',
              border: `1px solid ${T.border2}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                <span style={{ fontSize: 9, color: T.text3, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>SCORE</span>
                <span style={{
                  fontSize: 9, fontWeight: 800, letterSpacing: '0.04em',
                  color: '#C084FC',
                  background: 'rgba(155,47,201,0.18)',
                  border: '1px solid rgba(155,47,201,0.35)',
                  borderRadius: 4, padding: '1px 5px',
                }}>
                  {currentRound}/{MAX_ROUNDS}판
                </span>
              </div>
              <div style={{
                fontSize: 24, fontWeight: 800, color: T.neonY,
                textShadow: `0 0 12px rgba(255,215,0,0.5)`,
                lineHeight: 1,
              }}>
                {score.toLocaleString()}
              </div>
              {/* 점수 진행 바 */}
              <div style={{ marginTop: 6, height: 3, background: T.border, borderRadius: 99, overflow: 'hidden' }}>
                <motion.div
                  animate={{ width: `${scorePct * 100}%` }}
                  transition={{ duration: 0.4 }}
                  style={{ height: '100%', background: T.gradient, borderRadius: 99 }}
                />
              </div>
              <div style={{ fontSize: 9, color: T.text3, marginTop: 3 }}>목표 {WIN_SCORE.toLocaleString()}점</div>
            </div>

            {/* 이동 횟수 */}
            <div style={{
              flex: 1, background: T.surface2, borderRadius: 12,
              padding: '10px 13px',
              border: `1px solid ${movesLeft <= 5 ? 'rgba(255,92,92,0.35)' : T.border2}`,
            }}>
              <div style={{ fontSize: 9, color: T.text3, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>MOVES</div>
              <div style={{
                fontSize: 24, fontWeight: 800,
                color: movesLeft <= 5 ? T.up : T.text,
                textShadow: movesLeft <= 5 ? `0 0 12px rgba(255,92,92,0.5)` : 'none',
                lineHeight: 1,
              }}>
                {movesLeft}
              </div>
              {/* 이동 진행 바 */}
              <div style={{ marginTop: 6, height: 3, background: T.border, borderRadius: 99, overflow: 'hidden' }}>
                <motion.div
                  animate={{ width: `${movePct * 100}%` }}
                  transition={{ duration: 0.3 }}
                  style={{ height: '100%', background: barColor, borderRadius: 99 }}
                />
              </div>
              <div style={{ fontSize: 9, color: T.text3, marginTop: 3 }}>남은 이동</div>
            </div>

            {/* 상태 */}
            <div style={{
              width: 60, background: isProcessing ? 'rgba(255,61,120,0.08)' : T.surface2,
              borderRadius: 12, padding: '10px 6px',
              border: `1px solid ${isProcessing ? 'rgba(255,61,120,0.25)' : T.border2}`,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
            }}>
              <motion.div
                animate={isProcessing ? { rotate: 360 } : { rotate: 0 }}
                transition={{ repeat: isProcessing ? Infinity : 0, duration: 1, ease: 'linear' }}
                style={{ fontSize: 20 }}
              >
                {isProcessing ? '⚙️' : '🎯'}
              </motion.div>
              <div style={{ fontSize: 9, fontWeight: 700, color: isProcessing ? T.gold : T.text3, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {isProcessing ? 'Magic' : 'Ready'}
              </div>
            </div>
          </div>
        </div>

        {/* ── 보드 ─────────────────────────────── */}
        <div style={{ padding: '10px 12px 8px' }}>
          <div style={{
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 18,
            padding: 5,
            position: 'relative',
          }}>
            {/* 보드 네온 글로우 장식 */}
            <div style={{
              position: 'absolute', inset: -1,
              borderRadius: 18,
              background: 'transparent',
              boxShadow: `inset 0 0 30px rgba(255,61,120,0.04), 0 0 40px rgba(255,140,0,0.05)`,
              pointerEvents: 'none',
            }} />

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`,
                gap: 3,
                position: 'relative',
                touchAction: 'none', // 스크롤 간섭 방지
              }}
            >
              {grid.map((row, r) =>
                row.map((cell, c) => {
                  const isSel = selectedCell?.r === r && selectedCell?.c === c
                  const isNbr = selectedCell
                    ? (Math.abs(r - selectedCell.r) === 1 && c === selectedCell.c) ||
                      (Math.abs(c - selectedCell.c) === 1 && r === selectedCell.r)
                    : false
                  const borderCol = isSel
                    ? T.neonY
                    : isNbr
                    ? 'rgba(255,215,0,0.35)'
                    : cell?.type.borderColor ?? T.border2

                  // 스왑 애니메이션 오프셋 계산
                  const isFromSwap = swappingPair?.from.r === r && swappingPair?.from.c === c
                  const isToSwap   = swappingPair?.to.r   === r && swappingPair?.to.c   === c
                  const swapDeltaX = isFromSwap
                    ? `calc(${(swappingPair!.to.c   - c) * 100}% + ${(swappingPair!.to.c   - c) * GAP}px)`
                    : isToSwap
                    ? `calc(${(swappingPair!.from.c  - c) * 100}% + ${(swappingPair!.from.c  - c) * GAP}px)`
                    : 0
                  const swapDeltaY = isFromSwap
                    ? `calc(${(swappingPair!.to.r   - r) * 100}% + ${(swappingPair!.to.r   - r) * GAP}px)`
                    : isToSwap
                    ? `calc(${(swappingPair!.from.r  - r) * 100}% + ${(swappingPair!.from.r  - r) * GAP}px)`
                    : 0

                  return (
                    <div
                      key={`slot-${r}-${c}`}
                      onPointerDown={e => handlePointerDown(r, c, e)}
                      onPointerUp={e => handlePointerUp(r, c, e)}
                      style={{ position: 'relative', aspectRatio: '1/1', cursor: isProcessing ? 'default' : 'pointer', touchAction: 'none' }}
                    >
                      <AnimatePresence mode="popLayout">
                        {cell && (
                          <motion.div
                            key={cell.id}
                            layout
                            initial={{ scale: 0, opacity: 0, y: -20 }}
                            animate={{
                              scale: 1, opacity: 1,
                              x: swapDeltaX,
                              y: swapDeltaY,
                              ...(isSel
                                ? { rotate: [0, -7, 7, -4, 4, 0], scale: [1, 1.12, 1.12, 1.12, 1.12, 1] }
                                : {}),
                            }}
                            exit={{
                              scale: [1, 1.5, 0],
                              opacity: [1, 1, 0],
                              rotate: [0, 15, -15],
                              transition: { duration: 0.28 },
                            }}
                            transition={{
                              layout: { type: 'spring', stiffness: 300, damping: 24 },
                              x: (isFromSwap || isToSwap)
                                ? { duration: 0.25, ease: [0.4, 0, 0.2, 1] }
                                : { duration: 0.15 },
                              y: (isFromSwap || isToSwap)
                                ? { duration: 0.25, ease: [0.4, 0, 0.2, 1] }
                                : { duration: 0.15 },
                              scale: isSel
                                ? { duration: 0.4, repeat: Infinity, repeatDelay: 1.2 }
                                : { duration: 0.2 },
                              rotate: { duration: 0.4 },
                              opacity: { duration: 0.18 },
                            }}
                            style={{
                              position: 'absolute', inset: 0,
                              borderRadius: 9,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: cell.type.bgColor,
                              border: `1.5px solid ${borderCol}`,
                              zIndex: (isFromSwap || isToSwap) ? 20 : 'auto',
                              boxShadow: isSel
                                ? `0 0 0 2px ${T.neonY}, 0 0 14px rgba(255,215,0,0.4), inset 0 0 8px rgba(255,215,0,0.08)`
                                : isNbr
                                ? `0 0 8px rgba(255,215,0,0.15)`
                                : `0 2px 6px rgba(0,0,0,0.4), inset 0 0 6px ${cell.type.bgColor}`,
                              userSelect: 'none',
                            }}
                          >
                            {/* 빵 이모지 */}
                            <span style={{ fontSize: 18, lineHeight: 1, filter: `drop-shadow(0 0 4px ${cell.type.glowColor}66)` }}>
                              {cell.type.emoji}
                            </span>

                            {/* 특수블록 뱃지 */}
                            {cell.special && (() => {
                              const s = SPECIAL_LABEL[cell.special]
                              return (
                                <motion.span
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  style={{
                                    position: 'absolute', top: -5, right: -5,
                                    fontSize: 9, lineHeight: 1,
                                    background: s.bg,
                                    borderRadius: 5, padding: '1px 3px',
                                    color: s.color, fontWeight: 700,
                                    boxShadow: `0 0 6px ${s.bg}88`,
                                  }}
                                >
                                  {s.icon}
                                </motion.span>
                              )
                            })()}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )
                })
              )}

              {/* 파티클 레이어 */}
              <ParticleLayer particles={particles} />

              {/* 콤보 텍스트 */}
              <AnimatePresence>
                {combo > 1 && lastMatchPos && (
                  <motion.div
                    key={`combo-${combo}`}
                    initial={{ opacity: 0, scale: 0.3, y: 8 }}
                    animate={{ opacity: 1, scale: 1, y: -14 }}
                    exit={{ opacity: 0, scale: 0.5, y: -24, transition: { duration: 0.2 } }}
                    transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                    style={{
                      position: 'absolute',
                      left: `${(lastMatchPos.c / GRID_SIZE) * 100}%`,
                      top:  `${(lastMatchPos.r / GRID_SIZE) * 100}%`,
                      pointerEvents: 'none', zIndex: 60,
                      fontWeight: 900, fontSize: comboFs,
                      fontStyle: 'italic', whiteSpace: 'nowrap',
                      color: comboColor,
                      textShadow: `0 0 16px ${comboColor}, 0 0 6px ${comboColor}88, 0 2px 4px rgba(0,0,0,0.9)`,
                      letterSpacing: '-0.5px',
                    }}
                  >
                    {combo}× COMBO!
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* 범례 */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 8, marginBottom: 2 }}>
            {[
              { bg: '#0EA5E9', icon: '⚡', label: '4개 → 줄 클리어' },
              { bg: '#FF3D78', icon: '💥', label: '5개+ / T·L자 폭탄' },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: T.text3 }}>
                <span style={{
                  background: item.bg, borderRadius: 4,
                  padding: '1px 5px', color: '#fff', fontWeight: 700, fontSize: 9,
                  boxShadow: `0 0 6px ${item.bg}88`,
                }}>
                  {item.icon}
                </span>
                {item.label}
              </div>
            ))}
          </div>
        </div>

        {/* ── 푸터 ─────────────────────────────── */}
        <div style={{ padding: '0 12px 14px' }}>
          <button
            onClick={resetAll}
            disabled={isProcessing}
            style={{
              width: '100%', padding: '12px',
              borderRadius: 12, border: 'none',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              background: isProcessing ? T.surface2 : T.gradient,
              color: isProcessing ? T.text3 : '#fff',
              fontWeight: 700, fontSize: 14, fontFamily: 'inherit',
              boxShadow: isProcessing ? 'none' : '0 4px 16px rgba(255,61,120,0.3)',
            }}
          >
            {isProcessing ? '🔄 처리 중...' : '🔄 처음부터 (1판)'}
          </button>
        </div>
      </div>

      {/* ── 판 종료 모달 ──────────────────────── */}
      <AnimatePresence>
        {gameState !== 'playing' && !showFinal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'absolute', inset: 0, zIndex: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.75)',
              backdropFilter: 'blur(8px)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <motion.div
              initial={{ scale: 0.65, opacity: 0, y: 40 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.75, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 280, damping: 22 }}
              style={{
                background: T.surface,
                border: `1px solid ${gameState === 'won' ? 'rgba(255,215,0,0.35)' : 'rgba(255,92,92,0.3)'}`,
                borderRadius: 22,
                padding: '26px 22px 22px',
                textAlign: 'center',
                maxWidth: 300, width: '88%',
                boxShadow: '0 30px 60px rgba(0,0,0,0.7)',
              }}
            >
              {/* 판수 표시 */}
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                background: 'rgba(155,47,201,0.15)',
                border: '1px solid rgba(155,47,201,0.35)',
                borderRadius: 8, padding: '3px 10px', marginBottom: 12,
              }}>
                <span style={{ fontSize: 10, color: '#C084FC', fontWeight: 700 }}>{currentRound}판 결과</span>
                <span style={{ fontSize: 10, color: '#7C3AED' }}>/ {MAX_ROUNDS}판</span>
              </div>

              {/* 아이콘 */}
              <motion.div
                animate={gameState === 'won' ? { rotate: [0,-10,10,-6,6,0], scale:[1,1.15,1] } : { y:[0,-6,0] }}
                transition={{ repeat: Infinity, duration: gameState === 'won' ? 2 : 1.5, repeatDelay: 1 }}
                style={{ fontSize: 50, marginBottom: 8 }}
              >
                {gameState === 'won' ? '🏆' : '😢'}
              </motion.div>

              <div style={{
                fontSize: 24, fontWeight: 900, marginBottom: 3,
                background: gameState === 'won' ? `linear-gradient(135deg, ${T.neonY}, ${T.neonO})` : T.gradient,
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              }}>
                {gameState === 'won' ? '성공!' : '실패...'}
              </div>
              <div style={{ fontSize: 11, color: T.text3, marginBottom: 14 }}>
                {gameState === 'won' ? `${WIN_SCORE}점 돌파!` : `목표 ${WIN_SCORE}점 미달`}
              </div>

              {/* 점수 */}
              <div style={{
                background: T.surface2, borderRadius: 12,
                padding: '12px 16px', marginBottom: 14,
                border: `1px solid ${T.border2}`,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: 9, color: T.text3, fontWeight: 700, letterSpacing: '0.1em' }}>이번 점수</span>
                  <span style={{ fontSize: 9, color: T.text3, fontWeight: 700, letterSpacing: '0.1em' }}>최고 점수</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 30, fontWeight: 900, color: T.neonY, textShadow: '0 0 16px rgba(255,215,0,0.5)', lineHeight: 1 }}>
                    {(score || 0).toLocaleString()}
                  </span>
                  <span style={{ fontSize: 22, fontWeight: 800, color: score >= bestScore ? T.neonY : T.text2, lineHeight: 1 }}>
                    {bestScore.toLocaleString()}
                    {score > 0 && score >= bestScore && (
                      <span style={{ fontSize: 9, color: T.neonO, marginLeft: 4, verticalAlign: 'middle' }}>NEW!</span>
                    )}
                  </span>
                </div>
              </div>

              {/* 버튼 */}
              {currentRound < MAX_ROUNDS ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={goNextRound}
                    style={{
                      flex: 2, padding: '13px', borderRadius: 12, border: 'none',
                      background: T.gradient, color: '#fff',
                      fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
                      boxShadow: '0 4px 14px rgba(255,61,120,0.4)',
                    }}
                  >
                    {currentRound + 1}판 시작 →
                  </button>
                  <button
                    onClick={resetAll}
                    style={{
                      flex: 1, padding: '13px', borderRadius: 12,
                      border: `1px solid ${T.border2}`,
                      background: T.surface2, color: T.text2,
                      fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    처음부터
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowFinal(true)}
                  style={{
                    width: '100%', padding: '13px', borderRadius: 12, border: 'none',
                    background: T.gradient, color: '#fff',
                    fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
                    boxShadow: '0 4px 14px rgba(255,61,120,0.4)',
                  }}
                >
                  🏁 최종 결과 보기
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── 10판 완료 최종 결과 ─────────────────── */}
      <AnimatePresence>
        {showFinal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'absolute', inset: 0, zIndex: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'rgba(0,0,0,0.85)',
              backdropFilter: 'blur(10px)',
            }}
            onClick={e => e.stopPropagation()}
          >
            <motion.div
              initial={{ scale: 0.6, opacity: 0, y: 50 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 260, damping: 20 }}
              style={{
                background: T.surface,
                border: '1px solid rgba(255,215,0,0.4)',
                borderRadius: 24,
                padding: '32px 26px 26px',
                textAlign: 'center',
                maxWidth: 310, width: '90%',
                boxShadow: '0 0 60px rgba(255,215,0,0.12), 0 40px 80px rgba(0,0,0,0.8)',
              }}
            >
              <motion.div
                animate={{ rotate: [0,-12,12,-8,8,0], scale:[1,1.2,1] }}
                transition={{ repeat: Infinity, duration: 2.5, repeatDelay: 0.5 }}
                style={{ fontSize: 60, marginBottom: 10 }}
              >
                🎊
              </motion.div>

              <div style={{
                fontSize: 22, fontWeight: 900, marginBottom: 4,
                background: `linear-gradient(135deg, ${T.neonY}, ${T.neonO}, #FF3D78)`,
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
              }}>
                10판 완료!
              </div>
              <div style={{ fontSize: 12, color: T.text3, marginBottom: 20 }}>도전을 모두 마쳤어요 🍞</div>

              {/* 최종 스탯 */}
              <div style={{
                background: T.surface2, borderRadius: 14,
                padding: '16px 18px', marginBottom: 20,
                border: `1px solid ${T.border2}`,
              }}>
                <div style={{ fontSize: 9, color: T.text3, fontWeight: 700, letterSpacing: '0.1em', marginBottom: 10 }}>10판 최고 점수</div>
                <div style={{
                  fontSize: 46, fontWeight: 900, lineHeight: 1,
                  color: T.neonY,
                  textShadow: '0 0 24px rgba(255,215,0,0.6)',
                }}>
                  {bestScore.toLocaleString()}
                </div>
                <div style={{ fontSize: 11, color: T.text3, marginTop: 8 }}>
                  빵 환산&nbsp;
                  <span style={{ color: T.gold, fontWeight: 700 }}>
                    {(Math.floor(bestScore / 100) * 0.1).toFixed(1)}개
                  </span>&nbsp;가치
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={resetAll}
                  style={{
                    flex: 1, padding: '13px', borderRadius: 12, border: 'none',
                    background: T.gradient, color: '#fff',
                    fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
                    boxShadow: '0 4px 14px rgba(255,61,120,0.4)',
                  }}
                >
                  다시 도전
                </button>
                <button
                  onClick={() => setShowExitConfirm(true)}
                  style={{
                    flex: 1, padding: '13px', borderRadius: 12,
                    border: `1px solid ${T.border2}`,
                    background: T.surface2, color: T.text2,
                    fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
                  }}
                >
                  나가기
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* ── 종료 확인 다이얼로그 ─────────────────── */}
      {showExitConfirm && (
        <div
          onClick={cancelExit}
          style={{
            position: 'absolute', inset: 0, zIndex: 800,
            background: 'rgba(0,0,0,0.75)',
            backdropFilter: 'blur(6px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: T.surface,
              border: `1px solid ${T.border2}`,
              borderRadius: 20, padding: '28px 28px 22px',
              textAlign: 'center', width: 260,
              boxShadow: '0 0 40px rgba(0,0,0,0.7)',
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 10 }}>🍞</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: T.text, marginBottom: 8 }}>게임 종료</div>
            <div style={{ fontSize: 13, color: T.text2, marginBottom: 22, lineHeight: 1.6 }}>
              게임을 종료하시겠어요?<br />진행 중인 게임이 사라집니다.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={cancelExit}
                style={{
                  flex: 1, padding: '12px', borderRadius: 12,
                  border: `1px solid ${T.border2}`, background: T.surface2,
                  color: T.text2, fontWeight: 600, fontSize: 14,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >취소</button>
              <button
                onClick={confirmExit}
                style={{
                  flex: 1, padding: '12px', borderRadius: 12,
                  border: 'none', background: T.gradient,
                  color: '#fff', fontWeight: 700, fontSize: 14,
                  cursor: 'pointer', fontFamily: 'inherit',
                  boxShadow: '0 4px 14px rgba(255,61,120,0.3)',
                }}
              >종료</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
