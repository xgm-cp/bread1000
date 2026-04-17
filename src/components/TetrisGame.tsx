'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { X } from 'lucide-react'

const COLS = 10
const ROWS = 20
const BLOCK = 30

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
        ctx.fillStyle = 'rgba(255,255,255,0.15)'
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
      const x = (piece.x + c) * BLOCK
      const y = (ghostY + r) * BLOCK
      ctx.fillStyle = 'rgba(255,255,255,0.12)'
      ctx.fillRect(x + 1, y + 1, BLOCK - 2, BLOCK - 2)
    }
  }
}

const SCORE_TABLE = [0, 100, 300, 500, 800]

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
      nctx.fillStyle = '#111'
      nctx.fillRect(0, 0, nc.width, nc.height)
      const p = nextPieceRef.current
      const ox = Math.floor((4 - p.shape[0].length) / 2)
      const oy = Math.floor((4 - p.shape.length) / 2)
      for (let r = 0; r < p.shape.length; r++) {
        for (let c = 0; c < p.shape[r].length; c++) {
          if (!p.shape[r][c]) continue
          nctx.fillStyle = p.color
          nctx.fillRect((ox + c) * 24 + 1, (oy + r) * 24 + 1, 22, 22)
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (gameOverRef.current) return
      if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        pausedRef.current = !pausedRef.current
        setPaused(pausedRef.current)
        return
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
      if (!gameOverRef.current) {
        rafRef.current = requestAnimationFrame(loop)
      }
      if (!pausedRef.current && !gameOverRef.current) {
        dropCounterRef.current += time - lastTimeRef.current
        if (dropCounterRef.current > getDropInterval()) {
          moveDown()
          dropCounterRef.current = 0
        }
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
    scoreRef.current = 0
    linesRef.current = 0
    levelRef.current = 1
    gameOverRef.current = false
    pausedRef.current = false
    dropCounterRef.current = 0
    lastTimeRef.current = 0
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

  // 터치 스와이프
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)
  function onTouchStart(e: React.TouchEvent) {
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (!touchStartRef.current || pausedRef.current || gameOverRef.current) return
    const dx = e.changedTouches[0].clientX - touchStartRef.current.x
    const dy = e.changedTouches[0].clientY - touchStartRef.current.y
    const adx = Math.abs(dx), ady = Math.abs(dy)
    if (adx < 8 && ady < 8) { rotatePiece(); render() }
    else if (adx > ady) { dx < 0 ? moveLeft() : moveRight(); render() }
    else { dy > 0 ? hardDrop() : null; render() }
    touchStartRef.current = null
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 500, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: COLS * BLOCK + 120, maxWidth: '95vw', marginBottom: 12 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: 2 }}>TETRIS</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', display: 'flex', padding: 4 }}><X size={24} /></button>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {/* 게임 캔버스 */}
        <canvas
          ref={canvasRef}
          width={COLS * BLOCK}
          height={ROWS * BLOCK}
          style={{ border: '2px solid #333', borderRadius: 6, touchAction: 'none' }}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
        />

        {/* 사이드 패널 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 100 }}>
          <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 10, color: '#666', marginBottom: 4, letterSpacing: 1 }}>NEXT</div>
            <canvas ref={nextCanvasRef} width={96} height={96} />
          </div>
          <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 10, color: '#666', marginBottom: 2, letterSpacing: 1 }}>SCORE</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{score.toLocaleString()}</div>
          </div>
          <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 10, color: '#666', marginBottom: 2, letterSpacing: 1 }}>LINES</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{lines}</div>
          </div>
          <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 10, color: '#666', marginBottom: 2, letterSpacing: 1 }}>LEVEL</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#F0A000' }}>{level}</div>
          </div>
          <button
            onClick={() => { pausedRef.current = !pausedRef.current; setPaused(p => !p) }}
            disabled={gameOver}
            style={{ padding: '8px', borderRadius: 8, border: '1px solid #444', background: '#1a1a1a', color: paused ? '#F0A000' : '#aaa', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {paused ? '재개' : '일시정지'}
          </button>
        </div>
      </div>

      {/* 조작법 */}
      <div style={{ marginTop: 12, fontSize: 11, color: '#555', textAlign: 'center', lineHeight: 1.8 }}>
        ← → 이동 &nbsp;|&nbsp; ↑/Z 회전 &nbsp;|&nbsp; ↓ 내리기 &nbsp;|&nbsp; Space 낙하 &nbsp;|&nbsp; P 일시정지<br />
        모바일: 스와이프 좌우/아래(낙하) · 탭(회전)
      </div>

      {/* 게임오버 오버레이 */}
      {gameOver && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.7)', zIndex: 10 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#FF3D78', marginBottom: 8 }}>GAME OVER</div>
          <div style={{ fontSize: 16, color: '#fff', marginBottom: 4 }}>점수: {score.toLocaleString()}</div>
          <div style={{ fontSize: 14, color: '#aaa', marginBottom: 24 }}>{lines}줄 제거 · 레벨 {level}</div>
          <button onClick={restart} style={{ padding: '12px 32px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#FF3D78,#FF6B35)', color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer', fontFamily: 'inherit' }}>
            다시 시작
          </button>
        </div>
      )}

      {/* 일시정지 오버레이 */}
      {paused && !gameOver && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', zIndex: 10 }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#F0A000' }}>PAUSED</div>
          <div style={{ fontSize: 13, color: '#aaa', marginTop: 8 }}>P키 또는 버튼으로 재개</div>
        </div>
      )}
    </div>
  )
}
