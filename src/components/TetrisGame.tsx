'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { X } from 'lucide-react'

const COLS = 10
const ROWS = 20

const TETROMINOES = [
  { shape: [[1,1,1,1]], color: '#00F0F0' },
  { shape: [[1,1],[1,1]], color: '#F0F000' },
  { shape: [[0,1,0],[1,1,1]], color: '#A000F0' },
  { shape: [[1,0],[1,1],[0,1]], color: '#00F000' },
  { shape: [[0,1],[1,1],[1,0]], color: '#F00000' },
  { shape: [[1,0],[1,0],[1,1]], color: '#F0A000' },
  { shape: [[0,1],[0,1],[1,1]], color: '#0000F0' },
]

type Board = (string | 0)[][]
type Piece = { shape: number[][], color: string, x: number, y: number }

function emptyBoard(): Board {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0))
}
function randomPiece(): Piece {
  const t = TETROMINOES[Math.floor(Math.random() * TETROMINOES.length)]
  return { shape: t.shape, color: t.color, x: Math.floor(COLS / 2) - Math.floor(t.shape[0].length / 2), y: 0 }
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
function mergePiece(board: Board, piece: Piece): Board {
  const b = board.map(r => [...r])
  for (let r = 0; r < piece.shape.length; r++)
    for (let c = 0; c < piece.shape[r].length; c++) {
      if (!piece.shape[r][c]) continue
      const ny = piece.y + r
      if (ny >= 0) b[ny][piece.x + c] = piece.color
    }
  return b
}
function clearLines(board: Board): { board: Board; lines: number } {
  const filtered = board.filter(row => row.some(cell => !cell))
  const lines = ROWS - filtered.length
  return { board: [...Array.from({ length: lines }, () => Array(COLS).fill(0)), ...filtered], lines }
}
const SCORE_TABLE = [0, 100, 300, 500, 800]

// 헤더 36px + 정보바 44px + 조이패드 116px + 여백 8px = 204px
const OVERHEAD = 204

function calcBlockSize(W: number, H: number): number {
  const fromW = Math.floor((W - 4) / COLS)   // 좌우 border 2px씩
  const fromH = Math.floor((H - OVERHEAD) / ROWS)
  const maxB = W > 600 ? 34 : 40             // 데스크탑 최대 캡
  return Math.max(14, Math.min(fromW, fromH, maxB))
}

export default function TetrisGame({ onClose }: { onClose: () => void }) {
  const [block, setBlock] = useState(28)
  const blockRef = useRef(28)

  useEffect(() => {
    function update() {
      const b = calcBlockSize(window.innerWidth, window.innerHeight)
      blockRef.current = b
      setBlock(b)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const nextCanvasRef = useRef<HTMLCanvasElement>(null)
  const boardRef = useRef<Board>(emptyBoard())
  const pieceRef = useRef<Piece>(randomPiece())
  const nextRef = useRef<Piece>(randomPiece())
  const [score, setScore] = useState(0)
  const [lines, setLines] = useState(0)
  const [level, setLevel] = useState(1)
  const [gameOver, setGameOver] = useState(false)
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(false)
  const gameOverRef = useRef(false)
  const scoreRef = useRef(0)
  const linesRef = useRef(0)
  const levelRef = useRef(1)
  const rafRef = useRef<number>(0)
  const lastTimeRef = useRef(0)
  const dropCounterRef = useRef(0)
  const repeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const repeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [activeBtn, setActiveBtn] = useState<string | null>(null)

  const getDropInterval = () => Math.max(100, 800 - (levelRef.current - 1) * 80)

  const render = useCallback(() => {
    const B = blockRef.current
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#111'
    ctx.fillRect(0, 0, COLS * B, ROWS * B)
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const cell = boardRef.current[r][c]
        if (cell) {
          ctx.fillStyle = cell as string
          ctx.fillRect(c * B + 1, r * B + 1, B - 2, B - 2)
          ctx.fillStyle = 'rgba(255,255,255,0.18)'
          ctx.fillRect(c * B + 1, r * B + 1, B - 2, 3)
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.03)'
          ctx.fillRect(c * B + 1, r * B + 1, B - 2, B - 2)
        }
      }
    let ghostY = pieceRef.current.y
    while (isValid(boardRef.current, { ...pieceRef.current, y: ghostY + 1 })) ghostY++
    if (ghostY !== pieceRef.current.y)
      for (let r = 0; r < pieceRef.current.shape.length; r++)
        for (let c = 0; c < pieceRef.current.shape[r].length; c++) {
          if (!pieceRef.current.shape[r][c]) continue
          ctx.fillStyle = 'rgba(255,255,255,0.1)'
          ctx.fillRect((pieceRef.current.x + c) * B + 1, (ghostY + r) * B + 1, B - 2, B - 2)
        }
    for (let r = 0; r < pieceRef.current.shape.length; r++)
      for (let c = 0; c < pieceRef.current.shape[r].length; c++) {
        if (!pieceRef.current.shape[r][c]) continue
        ctx.fillStyle = pieceRef.current.color
        ctx.fillRect((pieceRef.current.x + c) * B + 1, (pieceRef.current.y + r) * B + 1, B - 2, B - 2)
        ctx.fillStyle = 'rgba(255,255,255,0.25)'
        ctx.fillRect((pieceRef.current.x + c) * B + 1, (pieceRef.current.y + r) * B + 1, B - 2, 3)
      }
    const nc = nextCanvasRef.current
    if (nc) {
      const nb = 16
      const nctx = nc.getContext('2d')!
      nctx.fillStyle = '#1a1a1a'
      nctx.fillRect(0, 0, nc.width, nc.height)
      const p = nextRef.current
      const ox = Math.floor((4 - p.shape[0].length) / 2)
      const oy = Math.floor((4 - p.shape.length) / 2)
      for (let r = 0; r < p.shape.length; r++)
        for (let c = 0; c < p.shape[r].length; c++) {
          if (!p.shape[r][c]) continue
          nctx.fillStyle = p.color
          nctx.fillRect((ox + c) * nb + 1, (oy + r) * nb + 1, nb - 2, nb - 2)
        }
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (canvas) { canvas.width = COLS * block; canvas.height = ROWS * block }
    render()
  }, [block, render])

  const lockPiece = useCallback(() => {
    boardRef.current = mergePiece(boardRef.current, pieceRef.current)
    const { board: nb, lines: cleared } = clearLines(boardRef.current)
    boardRef.current = nb
    linesRef.current += cleared
    scoreRef.current += SCORE_TABLE[cleared] * levelRef.current
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

  const rotatePiece = useCallback(() => {
    const rotated = rotate(pieceRef.current.shape)
    if (isValid(boardRef.current, pieceRef.current, 0, 0, rotated))
      pieceRef.current = { ...pieceRef.current, shape: rotated }
    else if (isValid(boardRef.current, pieceRef.current, 1, 0, rotated))
      pieceRef.current = { ...pieceRef.current, shape: rotated, x: pieceRef.current.x + 1 }
    else if (isValid(boardRef.current, pieceRef.current, -1, 0, rotated))
      pieceRef.current = { ...pieceRef.current, shape: rotated, x: pieceRef.current.x - 1 }
  }, [])

  function startRepeat(action: () => void) {
    action(); render()
    repeatTimerRef.current = setTimeout(() => {
      repeatIntervalRef.current = setInterval(() => { action(); render() }, 75)
    }, 180)
  }
  function stopRepeat() {
    if (repeatTimerRef.current) { clearTimeout(repeatTimerRef.current); repeatTimerRef.current = null }
    if (repeatIntervalRef.current) { clearInterval(repeatIntervalRef.current); repeatIntervalRef.current = null }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (gameOverRef.current) return
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); return }
      if (pausedRef.current) return
      if (e.key === 'ArrowLeft') { moveLeft(); render() }
      else if (e.key === 'ArrowRight') { moveRight(); render() }
      else if (e.key === 'ArrowDown') { moveDown(); render() }
      else if (e.key === 'ArrowUp' || e.key === 'z') { rotatePiece(); render() }
      else if (e.key === ' ') { e.preventDefault(); hardDrop(); render() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [moveLeft, moveRight, moveDown, rotatePiece, hardDrop, render])

  useEffect(() => {
    const loop = (time: number) => {
      if (!gameOverRef.current) rafRef.current = requestAnimationFrame(loop)
      if (!pausedRef.current && !gameOverRef.current) {
        dropCounterRef.current += time - lastTimeRef.current
        if (dropCounterRef.current > getDropInterval()) { moveDown(); dropCounterRef.current = 0 }
      }
      lastTimeRef.current = time; render()
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
    rafRef.current = requestAnimationFrame(function loop(time) {
      if (!gameOverRef.current) rafRef.current = requestAnimationFrame(loop)
      if (!pausedRef.current && !gameOverRef.current) {
        dropCounterRef.current += time - lastTimeRef.current
        if (dropCounterRef.current > getDropInterval()) { moveDown(); dropCounterRef.current = 0 }
      }
      lastTimeRef.current = time; render()
    })
  }

  function padPress(id: string, action: () => void, repeat = false) {
    if (pausedRef.current || gameOverRef.current) return
    setActiveBtn(id)
    if (repeat) startRepeat(action)
    else { action(); render() }
  }
  function padRelease() { setActiveBtn(null); stopRepeat() }

  const btnBase: React.CSSProperties = {
    borderRadius: 10, border: '2px solid #3a3a3a', background: '#1e1e1e',
    color: '#ccc', cursor: 'pointer', display: 'flex', alignItems: 'center',
    justifyContent: 'center', userSelect: 'none', WebkitUserSelect: 'none',
    touchAction: 'manipulation', fontFamily: 'inherit', flexShrink: 0,
    boxShadow: '0 3px 0 #0a0a0a',
  }
  function Btn({ id, label, repeat = false, action, style }: {
    id: string; label: React.ReactNode; repeat?: boolean; action: () => void; style?: React.CSSProperties
  }) {
    const active = activeBtn === id
    return (
      <button
        style={{ ...btnBase, ...style, ...(active ? { transform: 'translateY(2px)', boxShadow: '0 1px 0 #0a0a0a' } : {}) }}
        onPointerDown={e => { e.preventDefault(); padPress(id, action, repeat) }}
        onPointerUp={padRelease} onPointerLeave={padRelease} onPointerCancel={padRelease}
      >
        {label}
      </button>
    )
  }

  const cW = COLS * block
  // 조이패드 버튼 크기: 캔버스 너비에 비례, 44~58px
  const btnSz = Math.max(44, Math.min(58, Math.floor((cW - 60) / 5)))
  const bigBtnSz = Math.max(52, Math.min(70, btnSz + 12))

  return (
    <div style={{
      position: 'fixed', inset: 0, background: '#0a0a0a', zIndex: 500,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      overflow: 'hidden',
      // 모바일 주소창/내비게이션 바 고려한 실제 뷰포트 높이
      height: '100dvh',
    }}>

      {/* 헤더 — 고정 36px */}
      <div style={{
        width: '100%', flexShrink: 0, height: 36,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 12px', boxSizing: 'border-box',
      }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', letterSpacing: 3 }}>TETRIS</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onPointerDown={() => { pausedRef.current = !pausedRef.current; setPaused(p => !p) }}
            disabled={gameOver}
            style={{ padding: '3px 10px', borderRadius: 7, border: '1px solid #3a3a3a', background: '#1e1e1e', color: paused ? '#F0A000' : '#888', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {paused ? '▶ 재개' : '⏸ 정지'}
          </button>
          <button onPointerDown={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', display: 'flex', padding: 2 }}><X size={18} /></button>
        </div>
      </div>

      {/* 정보 바 — 고정 44px */}
      <div style={{
        width: '100%', flexShrink: 0, height: 44,
        display: 'flex', gap: 5, padding: '3px 10px', boxSizing: 'border-box', alignItems: 'stretch',
      }}>
        {[['SCORE', score.toLocaleString(), '#fff'], ['LINES', String(lines), '#fff'], ['LEVEL', String(level), '#F0A000']].map(([label, val, color]) => (
          <div key={label} style={{ flex: 1, background: '#1a1a1a', border: '1px solid #252525', borderRadius: 7, padding: '3px 7px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: 7, color: '#555', letterSpacing: 1 }}>{label}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color, lineHeight: 1.2 }}>{val}</div>
          </div>
        ))}
        <div style={{ background: '#1a1a1a', border: '1px solid #252525', borderRadius: 7, padding: '3px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ fontSize: 7, color: '#555', letterSpacing: 1, marginBottom: 1 }}>NEXT</div>
          <canvas ref={nextCanvasRef} width={64} height={64} style={{ display: 'block' }} />
        </div>
      </div>

      {/* 캔버스 — 남은 공간을 flex로 채우되, 실제 크기는 block 기준 */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <canvas
          ref={canvasRef}
          width={cW}
          height={ROWS * block}
          style={{ display: 'block', border: '2px solid #2a2a2a', borderRadius: 3 }}
        />
      </div>

      {/* 조이패드 — 고정 116px */}
      <div style={{
        width: '100%', flexShrink: 0, height: 116,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', boxSizing: 'border-box',
        borderTop: '1px solid #1a1a1a',
      }}>
        {/* D-패드 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ display: 'flex', gap: 5 }}>
            <Btn id="left"   label="◀" repeat action={moveLeft}  style={{ width: btnSz, height: btnSz, fontSize: btnSz * 0.4 }} />
            <Btn id="right"  label="▶" repeat action={moveRight} style={{ width: btnSz, height: btnSz, fontSize: btnSz * 0.4 }} />
            <Btn id="rotate" label="↺" action={() => { rotatePiece(); render() }}
              style={{ width: btnSz, height: btnSz, fontSize: btnSz * 0.46, background: 'rgba(160,0,240,0.2)', borderColor: '#7a00c0', color: '#c060ff' }} />
          </div>
          <Btn id="down" label="▼" repeat action={moveDown}
            style={{ width: btnSz * 3 + 10, height: Math.round(btnSz * 0.65), fontSize: btnSz * 0.4 }} />
        </div>

        {/* DROP */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
          <div style={{ fontSize: 8, color: '#555', letterSpacing: 1 }}>DROP</div>
          <Btn id="drop" label="⬇" action={() => { hardDrop(); render() }}
            style={{ width: bigBtnSz, height: bigBtnSz, fontSize: bigBtnSz * 0.4, background: 'rgba(255,61,120,0.18)', borderColor: '#cc2255', color: '#ff4488', boxShadow: '0 3px 0 #550011' }} />
        </div>
      </div>

      {/* 게임오버 */}
      {gameOver && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.8)', zIndex: 10 }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#FF3D78', marginBottom: 8 }}>GAME OVER</div>
          <div style={{ fontSize: 14, color: '#fff', marginBottom: 4 }}>점수: {score.toLocaleString()}</div>
          <div style={{ fontSize: 12, color: '#aaa', marginBottom: 20 }}>{lines}줄 · 레벨 {level}</div>
          <button onClick={restart} style={{ padding: '11px 32px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#FF3D78,#FF6B35)', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>
            다시 시작
          </button>
        </div>
      )}

      {/* 일시정지 */}
      {paused && !gameOver && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', zIndex: 10 }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#F0A000' }}>PAUSED</div>
        </div>
      )}
    </div>
  )
}
