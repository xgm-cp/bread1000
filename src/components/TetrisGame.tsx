'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { X } from 'lucide-react'

const COLS = 10
const ROWS = 20
const BLOCK = 28

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
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue
      const nx = piece.x + c + dx
      const ny = piece.y + r + dy
      if (nx < 0 || nx >= COLS || ny >= ROWS) return false
      if (ny >= 0 && board[ny][nx]) return false
    }
  }
  return true
}

function mergePiece(board: Board, piece: Piece): Board {
  const b = board.map(r => [...r])
  for (let r = 0; r < piece.shape.length; r++) {
    for (let c = 0; c < piece.shape[r].length; c++) {
      if (!piece.shape[r][c]) continue
      const ny = piece.y + r
      if (ny >= 0) b[ny][piece.x + c] = piece.color
    }
  }
  return b
}

function clearLines(board: Board): { board: Board, lines: number } {
  const filtered = board.filter(row => row.some(cell => !cell))
  const lines = ROWS - filtered.length
  const newRows = Array.from({ length: lines }, () => Array(COLS).fill(0))
  return { board: [...newRows, ...filtered], lines }
}

function drawBoard(ctx: CanvasRenderingContext2D, board: Board) {
  ctx.fillStyle = '#111'
  ctx.fillRect(0, 0, COLS * BLOCK, ROWS * BLOCK)
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c]) {
        ctx.fillStyle = board[r][c] as string
        ctx.fillRect(c * BLOCK + 1, r * BLOCK + 1, BLOCK - 2, BLOCK - 2)
        ctx.fillStyle = 'rgba(255,255,255,0.18)'
        ctx.fillRect(c * BLOCK + 1, r * BLOCK + 1, BLOCK - 2, 4)
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.03)'
        ctx.fillRect(c * BLOCK + 1, r * BLOCK + 1, BLOCK - 2, BLOCK - 2)
      }
    }
  }
}

function drawPiece(ctx: CanvasRenderingContext2D, piece: Piece) {
  for (let r = 0; r < piece.shape.length; r++) {
    for (let c = 0; c < piece.shape[r].length; c++) {
      if (!piece.shape[r][c]) continue
      const x = (piece.x + c) * BLOCK
      const y = (piece.y + r) * BLOCK
      ctx.fillStyle = piece.color
      ctx.fillRect(x + 1, y + 1, BLOCK - 2, BLOCK - 2)
      ctx.fillStyle = 'rgba(255,255,255,0.25)'
      ctx.fillRect(x + 1, y + 1, BLOCK - 2, 4)
    }
  }
}

function drawGhost(ctx: CanvasRenderingContext2D, board: Board, piece: Piece) {
  let ghostY = piece.y
  while (isValid(board, { ...piece, y: ghostY + 1 })) ghostY++
  if (ghostY === piece.y) return
  for (let r = 0; r < piece.shape.length; r++) {
    for (let c = 0; c < piece.shape[r].length; c++) {
      if (!piece.shape[r][c]) continue
      ctx.fillStyle = 'rgba(255,255,255,0.12)'
      ctx.fillRect((piece.x + c) * BLOCK + 1, (ghostY + r) * BLOCK + 1, BLOCK - 2, BLOCK - 2)
    }
  }
}

const SCORE_TABLE = [0, 100, 300, 500, 800]

const PAD_BTN: React.CSSProperties = {
  width: 58, height: 58, borderRadius: 14,
  border: '2px solid #444', background: '#222',
  color: '#fff', fontSize: 22, cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  userSelect: 'none', WebkitUserSelect: 'none',
  touchAction: 'manipulation', fontFamily: 'inherit',
  boxShadow: '0 4px 0 #111, 0 6px 12px rgba(0,0,0,0.5)',
  transition: 'transform 0.05s, box-shadow 0.05s',
  flexShrink: 0,
}

const PAD_BTN_ACTIVE: React.CSSProperties = {
  ...PAD_BTN,
  transform: 'translateY(3px)',
  boxShadow: '0 1px 0 #111, 0 2px 4px rgba(0,0,0,0.5)',
}

export default function TetrisGame({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const boardRef = useRef<Board>(emptyBoard())
  const pieceRef = useRef<Piece>(randomPiece())
  const nextPieceRef = useRef<Piece>(randomPiece())
  const nextCanvasRef = useRef<HTMLCanvasElement>(null)
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
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    drawBoard(ctx, boardRef.current)
    drawGhost(ctx, boardRef.current, pieceRef.current)
    drawPiece(ctx, pieceRef.current)

    const nc = nextCanvasRef.current
    if (nc) {
      const nctx = nc.getContext('2d')!
      nctx.fillStyle = '#1a1a1a'
      nctx.fillRect(0, 0, nc.width, nc.height)
      const p = nextPieceRef.current
      const ox = Math.floor((4 - p.shape[0].length) / 2)
      const oy = Math.floor((4 - p.shape.length) / 2)
      for (let r = 0; r < p.shape.length; r++) {
        for (let c = 0; c < p.shape[r].length; c++) {
          if (!p.shape[r][c]) continue
          nctx.fillStyle = p.color
          nctx.fillRect((ox + c) * 20 + 1, (oy + r) * 20 + 1, 18, 18)
        }
      }
    }
  }, [])

  const lockPiece = useCallback(() => {
    boardRef.current = mergePiece(boardRef.current, pieceRef.current)
    const { board: newBoard, lines: cleared } = clearLines(boardRef.current)
    boardRef.current = newBoard
    linesRef.current += cleared
    scoreRef.current += SCORE_TABLE[cleared] * levelRef.current
    levelRef.current = Math.floor(linesRef.current / 10) + 1
    setScore(scoreRef.current)
    setLines(linesRef.current)
    setLevel(levelRef.current)
    pieceRef.current = { ...nextPieceRef.current, x: Math.floor(COLS / 2) - Math.floor(nextPieceRef.current.shape[0].length / 2), y: 0 }
    nextPieceRef.current = randomPiece()
    if (!isValid(boardRef.current, pieceRef.current)) {
      gameOverRef.current = true
      setGameOver(true)
    }
  }, [])

  const moveDown = useCallback(() => {
    if (isValid(boardRef.current, pieceRef.current, 0, 1)) {
      pieceRef.current = { ...pieceRef.current, y: pieceRef.current.y + 1 }
    } else {
      lockPiece()
    }
  }, [lockPiece])

  const hardDrop = useCallback(() => {
    let dy = 0
    while (isValid(boardRef.current, pieceRef.current, 0, dy + 1)) dy++
    scoreRef.current += dy * 2
    pieceRef.current = { ...pieceRef.current, y: pieceRef.current.y + dy }
    setScore(scoreRef.current)
    lockPiece()
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
    if (isValid(boardRef.current, pieceRef.current, 0, 0, rotated)) {
      pieceRef.current = { ...pieceRef.current, shape: rotated }
    } else if (isValid(boardRef.current, pieceRef.current, 1, 0, rotated)) {
      pieceRef.current = { ...pieceRef.current, shape: rotated, x: pieceRef.current.x + 1 }
    } else if (isValid(boardRef.current, pieceRef.current, -1, 0, rotated)) {
      pieceRef.current = { ...pieceRef.current, shape: rotated, x: pieceRef.current.x - 1 }
    }
  }, [])

  // 반복 입력 (좌/우/아래 길게 누르기)
  function startRepeat(action: () => void) {
    action(); render()
    repeatTimerRef.current = setTimeout(() => {
      repeatIntervalRef.current = setInterval(() => { action(); render() }, 80)
    }, 200)
  }
  function stopRepeat() {
    if (repeatTimerRef.current) { clearTimeout(repeatTimerRef.current); repeatTimerRef.current = null }
    if (repeatIntervalRef.current) { clearInterval(repeatIntervalRef.current); repeatIntervalRef.current = null }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (gameOverRef.current) return
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); return
      }
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
      lastTimeRef.current = time
      render()
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [moveDown, render])

  function restart() {
    boardRef.current = emptyBoard()
    pieceRef.current = randomPiece()
    nextPieceRef.current = randomPiece()
    scoreRef.current = 0; linesRef.current = 0; levelRef.current = 1
    gameOverRef.current = false; pausedRef.current = false
    dropCounterRef.current = 0; lastTimeRef.current = 0
    setScore(0); setLines(0); setLevel(1); setGameOver(false); setPaused(false)
    rafRef.current = requestAnimationFrame(function loop(time) {
      if (!gameOverRef.current) rafRef.current = requestAnimationFrame(loop)
      if (!pausedRef.current && !gameOverRef.current) {
        dropCounterRef.current += time - lastTimeRef.current
        if (dropCounterRef.current > getDropInterval()) { moveDown(); dropCounterRef.current = 0 }
      }
      lastTimeRef.current = time
      render()
    })
  }

  function padPress(id: string, action: () => void, repeat = false) {
    if (pausedRef.current || gameOverRef.current) return
    setActiveBtn(id)
    if (repeat) startRepeat(action)
    else { action(); render() }
  }
  function padRelease() {
    setActiveBtn(null)
    stopRepeat()
  }

  function PadBtn({ id, label, repeat = false, action, style }: {
    id: string, label: React.ReactNode, repeat?: boolean, action: () => void, style?: React.CSSProperties
  }) {
    const isActive = activeBtn === id
    return (
      <button
        style={{ ...( isActive ? PAD_BTN_ACTIVE : PAD_BTN), ...style }}
        onPointerDown={e => { e.preventDefault(); padPress(id, action, repeat) }}
        onPointerUp={padRelease}
        onPointerLeave={padRelease}
        onPointerCancel={padRelease}
      >
        {label}
      </button>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0a0a0a', zIndex: 500, display: 'flex', flexDirection: 'column', alignItems: 'center', overflowY: 'auto' }}>

      {/* 상단 바 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', maxWidth: 420, padding: '12px 16px 0', flexShrink: 0 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', letterSpacing: 3 }}>TETRIS</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            onPointerDown={() => { pausedRef.current = !pausedRef.current; setPaused(p => !p) }}
            disabled={gameOver}
            style={{ padding: '5px 14px', borderRadius: 8, border: '1px solid #444', background: '#1a1a1a', color: paused ? '#F0A000' : '#aaa', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {paused ? '▶ 재개' : '⏸ 일시정지'}
          </button>
          <button onPointerDown={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', display: 'flex', padding: 4 }}><X size={22} /></button>
        </div>
      </div>

      {/* 정보 바 */}
      <div style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 420, padding: '10px 16px', flexShrink: 0 }}>
        <div style={{ flex: 1, background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, padding: '8px 10px' }}>
          <div style={{ fontSize: 9, color: '#555', letterSpacing: 1, marginBottom: 2 }}>SCORE</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{score.toLocaleString()}</div>
        </div>
        <div style={{ flex: 1, background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, padding: '8px 10px' }}>
          <div style={{ fontSize: 9, color: '#555', letterSpacing: 1, marginBottom: 2 }}>LINES</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{lines}</div>
        </div>
        <div style={{ flex: 1, background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, padding: '8px 10px' }}>
          <div style={{ fontSize: 9, color: '#555', letterSpacing: 1, marginBottom: 2 }}>LEVEL</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#F0A000' }}>{level}</div>
        </div>
        <div style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 10, padding: '8px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ fontSize: 9, color: '#555', letterSpacing: 1, marginBottom: 2 }}>NEXT</div>
          <canvas ref={nextCanvasRef} width={80} height={80} style={{ display: 'block' }} />
        </div>
      </div>

      {/* 캔버스 */}
      <div style={{ flexShrink: 0, position: 'relative' }}>
        <canvas
          ref={canvasRef}
          width={COLS * BLOCK}
          height={ROWS * BLOCK}
          style={{ border: '2px solid #2a2a2a', borderRadius: 4, display: 'block' }}
        />
      </div>

      {/* 조이패드 */}
      <div style={{ width: '100%', maxWidth: 420, padding: '16px 24px 32px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexShrink: 0, gap: 12 }}>

        {/* 왼쪽: 방향키 (D-패드) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          {/* 회전 버튼 (위) */}
          <PadBtn id="rotate" label="↺" action={() => { rotatePiece(); render() }}
            style={{ background: 'rgba(160,0,240,0.25)', borderColor: '#A000F0', color: '#A000F0', width: 58, height: 48, borderRadius: 12, fontSize: 24 }} />
          {/* 좌우 */}
          <div style={{ display: 'flex', gap: 6 }}>
            <PadBtn id="left" label="◀" repeat action={moveLeft} />
            <PadBtn id="right" label="▶" repeat action={moveRight} />
          </div>
          {/* 아래 */}
          <PadBtn id="down" label="▼" repeat action={moveDown}
            style={{ width: 122, borderRadius: 12, height: 48, fontSize: 18 }} />
        </div>

        {/* 오른쪽: 낙하 버튼 */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{ fontSize: 10, color: '#555', letterSpacing: 1, marginBottom: 2 }}>HARD DROP</div>
          <PadBtn id="drop" label="⬇" action={() => { hardDrop(); render() }}
            style={{ width: 72, height: 72, borderRadius: 18, fontSize: 30, background: 'rgba(255,61,120,0.2)', borderColor: '#FF3D78', color: '#FF3D78', boxShadow: '0 4px 0 #5a0020, 0 6px 16px rgba(255,61,120,0.3)' }} />
        </div>

      </div>

      {/* 게임오버 */}
      {gameOver && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.75)', zIndex: 10 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#FF3D78', marginBottom: 8 }}>GAME OVER</div>
          <div style={{ fontSize: 16, color: '#fff', marginBottom: 4 }}>점수: {score.toLocaleString()}</div>
          <div style={{ fontSize: 14, color: '#aaa', marginBottom: 24 }}>{lines}줄 제거 · 레벨 {level}</div>
          <button onClick={restart} style={{ padding: '12px 36px', borderRadius: 14, border: 'none', background: 'linear-gradient(135deg,#FF3D78,#FF6B35)', color: '#fff', fontWeight: 700, fontSize: 17, cursor: 'pointer', fontFamily: 'inherit' }}>
            다시 시작
          </button>
        </div>
      )}

      {/* 일시정지 */}
      {paused && !gameOver && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', zIndex: 10 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#F0A000' }}>PAUSED</div>
          <div style={{ fontSize: 13, color: '#aaa', marginTop: 8 }}>버튼으로 재개</div>
        </div>
      )}
    </div>
  )
}
