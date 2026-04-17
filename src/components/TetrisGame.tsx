'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { X } from 'lucide-react'

const COLS = 10
const ROWS = 20

// 앱 테마 네온 팔레트
const PIECES = [
  { shape: [[1,1,1,1]],         color: '#4A9EFF', glow: 'rgba(74,158,255,0.7)'   }, // I — 네온 블루
  { shape: [[1,1],[1,1]],        color: '#FF3D78', glow: 'rgba(255,61,120,0.7)'   }, // O — 핑크
  { shape: [[0,1,0],[1,1,1]],    color: '#9B2FC9', glow: 'rgba(155,47,201,0.7)'   }, // T — 퍼플
  { shape: [[1,0],[1,1],[0,1]],  color: '#2ECC8A', glow: 'rgba(46,204,138,0.7)'   }, // S — 그린
  { shape: [[0,1],[1,1],[1,0]],  color: '#FF5C5C', glow: 'rgba(255,92,92,0.7)'    }, // Z — 레드
  { shape: [[1,0],[1,0],[1,1]],  color: '#FF6B35', glow: 'rgba(255,107,53,0.7)'   }, // J — 오렌지
  { shape: [[0,1],[0,1],[1,1]],  color: '#FFD700', glow: 'rgba(255,215,0,0.7)'    }, // L — 골드
]

type Board = (string | 0)[][]
type Piece  = { shape: number[][], color: string, glow: string, x: number, y: number }

function emptyBoard(): Board {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0))
}
function randomPiece(): Piece {
  const p = PIECES[Math.floor(Math.random() * PIECES.length)]
  return { ...p, x: Math.floor(COLS / 2) - Math.floor(p.shape[0].length / 2), y: 0 }
}
function rotate(shape: number[][]): number[][] {
  return shape[0].map((_, i) => shape.map(row => row[i]).reverse())
}
function isValid(board: Board, piece: Piece, dx = 0, dy = 0, shape = piece.shape): boolean {
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue
      const nx = piece.x + c + dx, ny = piece.y + r + dy
      if (nx < 0 || nx >= COLS || ny >= ROWS) return false
      if (ny >= 0 && board[ny][nx]) return false
    }
  return true
}
function merge(board: Board, piece: Piece): Board {
  const b = board.map(r => [...r])
  piece.shape.forEach((row, r) => row.forEach((v, c) => {
    if (v && piece.y + r >= 0) b[piece.y + r][piece.x + c] = piece.color
  }))
  return b
}
function clearLines(board: Board) {
  const kept = board.filter(row => row.some(c => !c))
  const cleared = ROWS - kept.length
  return { board: [...Array.from({ length: cleared }, () => Array(COLS).fill(0)), ...kept], cleared }
}
const SCORES = [0, 100, 300, 500, 800]

const OVERHEAD = 178   // 헤더 36 + 정보바 44 + 조이패드 90 + 여백 8

function calcBlock(W: number, H: number) {
  const fromW = Math.floor((W - 4) / COLS)
  const fromH = Math.floor((H - OVERHEAD) / ROWS)
  return Math.max(14, Math.min(fromW, fromH, W > 600 ? 34 : 40))
}

// 캔버스에 블록 한 개를 네온 글로우와 함께 그리기
function drawBlock(ctx: CanvasRenderingContext2D, x: number, y: number, B: number, color: string, glow: string, alpha = 1) {
  ctx.save()
  ctx.globalAlpha = alpha
  // 글로우
  ctx.shadowColor = glow
  ctx.shadowBlur = 10
  ctx.fillStyle = color
  ctx.fillRect(x + 1, y + 1, B - 2, B - 2)
  // 하이라이트 (위쪽 밝은 줄)
  ctx.shadowBlur = 0
  ctx.fillStyle = 'rgba(255,255,255,0.22)'
  ctx.fillRect(x + 1, y + 1, B - 2, 3)
  // 어두운 하단 그림자
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.fillRect(x + 1, y + B - 4, B - 2, 3)
  ctx.restore()
}

export default function TetrisGame({ onClose }: { onClose: () => void }) {
  const [block, setBlock] = useState(28)
  const blockRef = useRef(28)

  useEffect(() => {
    function update() {
      const b = calcBlock(window.innerWidth, window.innerHeight)
      blockRef.current = b; setBlock(b)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const nextCanvasRef = useRef<HTMLCanvasElement>(null)
  const boardRef     = useRef<Board>(emptyBoard())
  const pieceRef     = useRef<Piece>(randomPiece())
  const nextRef      = useRef<Piece>(randomPiece())

  const [score, setScore]     = useState(0)
  const [lines, setLines]     = useState(0)
  const [level, setLevel]     = useState(1)
  const [gameOver, setGameOver] = useState(false)
  const [paused, setPaused]   = useState(false)

  const pausedRef   = useRef(false)
  const gameOverRef = useRef(false)
  const scoreRef    = useRef(0)
  const linesRef    = useRef(0)
  const levelRef    = useRef(1)
  const rafRef      = useRef<number>(0)
  const lastTimeRef = useRef(0)
  const dropCounterRef = useRef(0)
  const repeatTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const repeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [activeBtn, setActiveBtn] = useState<string | null>(null)

  const getInterval = () => Math.max(100, 800 - (levelRef.current - 1) * 80)

  const render = useCallback(() => {
    const B = blockRef.current
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!

    // 배경
    ctx.fillStyle = '#0A0C0F'
    ctx.fillRect(0, 0, COLS * B, ROWS * B)

    // 그리드 라인
    ctx.strokeStyle = 'rgba(30,36,48,0.8)'
    ctx.lineWidth = 0.5
    for (let r = 0; r <= ROWS; r++) {
      ctx.beginPath(); ctx.moveTo(0, r * B); ctx.lineTo(COLS * B, r * B); ctx.stroke()
    }
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath(); ctx.moveTo(c * B, 0); ctx.lineTo(c * B, ROWS * B); ctx.stroke()
    }

    // 보드에 쌓인 블록
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const cell = boardRef.current[r][c]
        if (!cell) continue
        const p = PIECES.find(p => p.color === cell)
        drawBlock(ctx, c * B, r * B, B, cell as string, p?.glow ?? 'rgba(255,255,255,0.4)')
      }

    // 고스트
    let gy = pieceRef.current.y
    while (isValid(boardRef.current, { ...pieceRef.current, y: gy + 1 })) gy++
    if (gy !== pieceRef.current.y)
      pieceRef.current.shape.forEach((row, r) => row.forEach((v, c) => {
        if (!v) return
        ctx.save()
        ctx.globalAlpha = 0.18
        ctx.fillStyle = pieceRef.current.color
        ctx.fillRect((pieceRef.current.x + c) * B + 1, (gy + r) * B + 1, B - 2, B - 2)
        ctx.restore()
      }))

    // 현재 피스
    pieceRef.current.shape.forEach((row, r) => row.forEach((v, c) => {
      if (!v) return
      drawBlock(ctx, (pieceRef.current.x + c) * B, (pieceRef.current.y + r) * B, B, pieceRef.current.color, pieceRef.current.glow)
    }))

    // NEXT 미리보기
    const nc = nextCanvasRef.current
    if (nc) {
      const nb = 16, nctx = nc.getContext('2d')!
      nctx.fillStyle = '#111418'; nctx.fillRect(0, 0, nc.width, nc.height)
      const p = nextRef.current
      const ox = Math.floor((4 - p.shape[0].length) / 2)
      const oy = Math.floor((4 - p.shape.length) / 2)
      p.shape.forEach((row, r) => row.forEach((v, c) => {
        if (!v) return
        drawBlock(nctx, (ox + c) * nb, (oy + r) * nb, nb, p.color, p.glow)
      }))
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas) { canvas.width = COLS * block; canvas.height = ROWS * block }
    render()
  }, [block, render])

  const lockPiece = useCallback(() => {
    boardRef.current = merge(boardRef.current, pieceRef.current)
    const { board: nb, cleared } = clearLines(boardRef.current)
    boardRef.current = nb
    linesRef.current += cleared
    scoreRef.current += SCORES[cleared] * levelRef.current
    levelRef.current = Math.floor(linesRef.current / 10) + 1
    setScore(scoreRef.current); setLines(linesRef.current); setLevel(levelRef.current)
    pieceRef.current = { ...nextRef.current, x: Math.floor(COLS / 2) - Math.floor(nextRef.current.shape[0].length / 2), y: 0 }
    nextRef.current = randomPiece()
    if (!isValid(boardRef.current, pieceRef.current)) { gameOverRef.current = true; setGameOver(true) }
  }, [])

  const moveDown = useCallback(() => {
    if (isValid(boardRef.current, pieceRef.current, 0, 1))
      pieceRef.current = { ...pieceRef.current, y: pieceRef.current.y + 1 }
    else lockPiece()
  }, [lockPiece])

  const hardDrop = useCallback(() => {
    let dy = 0
    while (isValid(boardRef.current, pieceRef.current, 0, dy + 1)) dy++
    scoreRef.current += dy * 2
    pieceRef.current = { ...pieceRef.current, y: pieceRef.current.y + dy }
    setScore(scoreRef.current); lockPiece()
  }, [lockPiece])

  const moveLeft = useCallback(() => {
    if (isValid(boardRef.current, pieceRef.current, -1, 0))
      pieceRef.current = { ...pieceRef.current, x: pieceRef.current.x - 1 }
  }, [])

  const moveRight = useCallback(() => {
    if (isValid(boardRef.current, pieceRef.current, 1, 0))
      pieceRef.current = { ...pieceRef.current, x: pieceRef.current.x + 1 }
  }, [])

  const doRotate = useCallback(() => {
    const s = rotate(pieceRef.current.shape)
    if      (isValid(boardRef.current, pieceRef.current, 0, 0, s))  pieceRef.current = { ...pieceRef.current, shape: s }
    else if (isValid(boardRef.current, pieceRef.current, 1, 0, s))  pieceRef.current = { ...pieceRef.current, shape: s, x: pieceRef.current.x + 1 }
    else if (isValid(boardRef.current, pieceRef.current, -1, 0, s)) pieceRef.current = { ...pieceRef.current, shape: s, x: pieceRef.current.x - 1 }
  }, [])

  function startRepeat(fn: () => void) {
    fn(); render()
    repeatTimerRef.current = setTimeout(() => {
      repeatIntervalRef.current = setInterval(() => { fn(); render() }, 75)
    }, 180)
  }
  function stopRepeat() {
    if (repeatTimerRef.current)    { clearTimeout(repeatTimerRef.current);   repeatTimerRef.current = null }
    if (repeatIntervalRef.current) { clearInterval(repeatIntervalRef.current); repeatIntervalRef.current = null }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (gameOverRef.current) return
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); return }
      if (pausedRef.current) return
      if (e.key === 'ArrowLeft')  { moveLeft();  render() }
      if (e.key === 'ArrowRight') { moveRight(); render() }
      if (e.key === 'ArrowDown')  { moveDown();  render() }
      if (e.key === 'ArrowUp' || e.key === 'z') { doRotate(); render() }
      if (e.key === ' ') { e.preventDefault(); hardDrop(); render() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [moveLeft, moveRight, moveDown, doRotate, hardDrop, render])

  useEffect(() => {
    const loop = (t: number) => {
      if (!gameOverRef.current) rafRef.current = requestAnimationFrame(loop)
      if (!pausedRef.current && !gameOverRef.current) {
        dropCounterRef.current += t - lastTimeRef.current
        if (dropCounterRef.current > getInterval()) { moveDown(); dropCounterRef.current = 0 }
      }
      lastTimeRef.current = t; render()
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [moveDown, render])

  function restart() {
    boardRef.current = emptyBoard(); pieceRef.current = randomPiece(); nextRef.current = randomPiece()
    scoreRef.current = 0; linesRef.current = 0; levelRef.current = 1
    gameOverRef.current = false; pausedRef.current = false
    dropCounterRef.current = 0; lastTimeRef.current = 0
    setScore(0); setLines(0); setLevel(1); setGameOver(false); setPaused(false)
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(function loop(t) {
      if (!gameOverRef.current) rafRef.current = requestAnimationFrame(loop)
      if (!pausedRef.current && !gameOverRef.current) {
        dropCounterRef.current += t - lastTimeRef.current
        if (dropCounterRef.current > getInterval()) { moveDown(); dropCounterRef.current = 0 }
      }
      lastTimeRef.current = t; render()
    })
  }

  // ── 터치 스와이프 (캔버스 영역) ──
  const touchStartRef = useRef<{ x: number; y: number; t: number } | null>(null)

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0]
    touchStartRef.current = { x: t.clientX, y: t.clientY, t: Date.now() }
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (!touchStartRef.current || pausedRef.current || gameOverRef.current) return
    const t = e.changedTouches[0]
    const dx = t.clientX - touchStartRef.current.x
    const dy = t.clientY - touchStartRef.current.y
    const dt = Date.now() - touchStartRef.current.t
    const adx = Math.abs(dx), ady = Math.abs(dy)
    touchStartRef.current = null

    // 탭 (이동 8px 미만) → 회전
    if (adx < 8 && ady < 8) { doRotate(); render(); return }
    // 빠른 아래 스와이프 → 하드드롭
    if (ady > adx && dy > 30 && dt < 400) { hardDrop(); render(); return }
    // 좌우 스와이프 → 이동
    if (adx > ady && adx > 20) {
      if (dx < 0) { moveLeft(); render() }
      else        { moveRight(); render() }
    }
  }

  function padPress(id: string, fn: () => void, repeat = false) {
    if (pausedRef.current || gameOverRef.current) return
    setActiveBtn(id)
    if (repeat) startRepeat(fn); else { fn(); render() }
  }
  function padRelease() { setActiveBtn(null); stopRepeat() }

  // 버튼 베이스 스타일 (앱 테마)
  const btnBase: React.CSSProperties = {
    borderRadius: 12, border: '1.5px solid #252D3A',
    background: '#111418', color: '#8892A0',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    userSelect: 'none', WebkitUserSelect: 'none', touchAction: 'manipulation',
    fontFamily: 'inherit', flexShrink: 0,
    boxShadow: '0 3px 0 #060708, 0 0 0 0 transparent',
    transition: 'box-shadow 0.05s, transform 0.05s',
  }

  function Btn({ id, label, repeat = false, action, style }: {
    id: string; label: React.ReactNode; repeat?: boolean; action: () => void; style?: React.CSSProperties
  }) {
    const active = activeBtn === id
    return (
      <button
        style={{ ...btnBase, ...style, ...(active ? { transform: 'translateY(2px)', boxShadow: '0 1px 0 #060708' } : {}) }}
        onPointerDown={e => { e.preventDefault(); padPress(id, action, repeat) }}
        onPointerUp={padRelease} onPointerLeave={padRelease} onPointerCancel={padRelease}
      >
        {label}
      </button>
    )
  }

  const cW   = COLS * block
  const btnSz = Math.max(44, Math.min(58, Math.floor((cW - 60) / 5)))
  const bigSz = Math.max(52, Math.min(68, btnSz + 12))

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: '#0A0C0F',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      overflow: 'hidden', height: '100dvh',
    }}>

      {/* ── 헤더 ── */}
      <div style={{
        width: '100%', flexShrink: 0, height: 36,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 14px', boxSizing: 'border-box',
        borderBottom: '1px solid #1E2430',
      }}>
        {/* 앱 로고와 같은 그라디언트 텍스트 */}
        <span style={{
          fontSize: 16, fontWeight: 800, letterSpacing: 4,
          background: 'linear-gradient(135deg,#FF3D78,#9B2FC9)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>TETRIS</span>

        <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
          <button
            onPointerDown={() => { pausedRef.current = !pausedRef.current; setPaused(p => !p) }}
            disabled={gameOver}
            style={{
              padding: '3px 11px', borderRadius: 7,
              border: `1px solid ${paused ? '#9B2FC9' : '#1E2430'}`,
              background: paused ? 'rgba(155,47,201,0.12)' : '#111418',
              color: paused ? '#C060FF' : '#4A5568',
              fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {paused ? '▶ 재개' : '⏸ 정지'}
          </button>
          <button onPointerDown={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4A5568', display: 'flex', padding: 2 }}>
            <X size={18} />
          </button>
        </div>
      </div>

      {/* ── 정보 바 ── */}
      <div style={{
        width: '100%', flexShrink: 0, height: 44,
        display: 'flex', gap: 5, padding: '4px 10px', boxSizing: 'border-box',
        borderBottom: '1px solid #1E2430',
      }}>
        {([
          ['SCORE', score.toLocaleString(), '#FF3D78'],
          ['LINES', String(lines),          '#8892A0'],
          ['LEVEL', String(level),          '#9B2FC9'],
        ] as [string, string, string][]).map(([label, val, color]) => (
          <div key={label} style={{
            flex: 1, background: '#111418', border: '1px solid #1E2430',
            borderRadius: 7, padding: '3px 8px',
            display: 'flex', flexDirection: 'column', justifyContent: 'center',
          }}>
            <div style={{ fontSize: 7, color: '#4A5568', letterSpacing: 1, textTransform: 'uppercase' }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color }}>{val}</div>
          </div>
        ))}
        <div style={{
          background: '#111418', border: '1px solid #1E2430', borderRadius: 7,
          padding: '3px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ fontSize: 7, color: '#4A5568', letterSpacing: 1, marginBottom: 1 }}>NEXT</div>
          <canvas ref={nextCanvasRef} width={64} height={64} style={{ display: 'block' }} />
        </div>
      </div>

      {/* ── 캔버스 ── */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <canvas
          ref={canvasRef}
          width={cW}
          height={ROWS * block}
          style={{
            display: 'block',
            border: '1px solid #1E2430',
            borderRadius: 4,
            boxShadow: '0 0 40px rgba(255,61,120,0.06)',
            touchAction: 'none',
          }}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        />
      </div>

      {/* ── 조이패드 ── */}
      <div style={{
        width: '100%', flexShrink: 0, height: 90,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', boxSizing: 'border-box',
        borderTop: '1px solid #1E2430',
        background: 'rgba(17,20,24,0.95)',
      }}>
        {/* 방향 버튼 한 줄 */}
        <div style={{ display: 'flex', gap: 7 }}>
          <Btn id="left"   label="◀" repeat action={moveLeft}
            style={{ width: bigSz, height: bigSz, fontSize: bigSz * 0.38,
              border: '1.5px solid #252D3A', color: '#8892A0' }} />
          <Btn id="right"  label="▶" repeat action={moveRight}
            style={{ width: bigSz, height: bigSz, fontSize: bigSz * 0.38,
              border: '1.5px solid #252D3A', color: '#8892A0' }} />
          <Btn id="rotate" label="↺" action={() => { doRotate(); render() }}
            style={{ width: bigSz, height: bigSz, fontSize: bigSz * 0.44,
              background: 'rgba(155,47,201,0.15)', border: '1.5px solid #9B2FC9',
              color: '#C060FF', boxShadow: '0 3px 0 #2a0050, 0 0 12px rgba(155,47,201,0.3)' }} />
          <Btn id="down"   label="▼" repeat action={moveDown}
            style={{ width: bigSz, height: bigSz, fontSize: bigSz * 0.38,
              border: '1.5px solid #252D3A', color: '#8892A0' }} />
        </div>

        {/* DROP 버튼 — 앱 primary gradient */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <div style={{ fontSize: 8, color: '#4A5568', letterSpacing: 1 }}>DROP</div>
          <Btn id="drop" label="⬇" action={() => { hardDrop(); render() }}
            style={{
              width: bigSz, height: bigSz, fontSize: bigSz * 0.42,
              background: 'linear-gradient(135deg,rgba(255,61,120,0.25),rgba(155,47,201,0.25))',
              border: '1.5px solid #FF3D78', color: '#FF3D78',
              boxShadow: '0 3px 0 #5a0020, 0 0 16px rgba(255,61,120,0.35)',
            }} />
        </div>
      </div>

      {/* ── 게임오버 ── */}
      {gameOver && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          background: 'rgba(10,12,15,0.88)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(4px)',
        }}>
          <div style={{
            background: '#111418', border: '1px solid #252D3A',
            borderRadius: 20, padding: '32px 40px', textAlign: 'center',
            boxShadow: '0 0 60px rgba(255,61,120,0.15)',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', color: '#FF3D78', marginBottom: 10 }}>— GAME OVER —</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: '#EEF0F4', marginBottom: 4 }}>{score.toLocaleString()}</div>
            <div style={{ fontSize: 12, color: '#4A5568', marginBottom: 24 }}>{lines}줄 · 레벨 {level}</div>
            <button onClick={restart} style={{
              padding: '12px 36px', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg,#FF3D78,#9B2FC9)',
              color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer',
              fontFamily: 'inherit', boxShadow: '0 4px 16px rgba(255,61,120,0.35)',
            }}>
              다시 시작
            </button>
          </div>
        </div>
      )}

      {/* ── 일시정지 ── */}
      {paused && !gameOver && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          background: 'rgba(10,12,15,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          backdropFilter: 'blur(3px)',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: 22, fontWeight: 800, letterSpacing: 4,
              background: 'linear-gradient(135deg,#FF3D78,#9B2FC9)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>PAUSED</div>
            <div style={{ fontSize: 12, color: '#4A5568', marginTop: 6 }}>정지 버튼을 눌러 재개</div>
          </div>
        </div>
      )}
    </div>
  )
}
