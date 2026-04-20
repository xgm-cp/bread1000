'use client'
import { useState, useCallback, useRef } from 'react'

export const GRID_SIZE = 8
export const MAX_MOVES = 20
export const WIN_SCORE = 500

const MIN_MATCH = 3

export type BreadType = {
  id: string; emoji: string; bgColor: string; borderColor: string; glowColor: string
}

export const BREAD_TYPES: BreadType[] = [
  { id: 'croissant', emoji: '🥐', bgColor: 'rgba(255,140,0,0.10)',  borderColor: '#FF8C00', glowColor: '#FF8C00' },
  { id: 'baguette',  emoji: '🥖', bgColor: 'rgba(255,215,0,0.10)',  borderColor: '#FFD700', glowColor: '#FFD700' },
  { id: 'pretzel',   emoji: '🥨', bgColor: 'rgba(249,115,22,0.10)', borderColor: '#F97316', glowColor: '#F97316' },
  { id: 'toast',     emoji: '🍞', bgColor: 'rgba(251,191,36,0.10)', borderColor: '#FBBF24', glowColor: '#FBBF24' },
  { id: 'donut',     emoji: '🍩', bgColor: 'rgba(255,61,120,0.12)', borderColor: '#FF3D78', glowColor: '#FF3D78' },
  { id: 'pancake',   emoji: '🥞', bgColor: 'rgba(255,100,0,0.10)',  borderColor: '#FF6400', glowColor: '#FF6400' },
]

export type SpecialType = 'striped-h' | 'striped-v' | 'bomb' | null
export type GameState = 'playing' | 'won' | 'lost'

export type Cell = {
  id: string
  type: BreadType
  special: SpecialType
} | null

export type Particle = {
  id: string; r: number; c: number; color: string; dx: number; dy: number
}

const mkCell = (): NonNullable<Cell> => ({
  id: `c-${Math.random().toString(36).slice(2)}`,
  type: BREAD_TYPES[Math.floor(Math.random() * BREAD_TYPES.length)],
  special: null,
})

function findRuns(grid: Cell[][]) {
  const hRuns: { r: number; c: number; len: number }[] = []
  const vRuns: { r: number; c: number; len: number }[] = []
  for (let r = 0; r < GRID_SIZE; r++) {
    let c = 0
    while (c < GRID_SIZE) {
      if (!grid[r][c]) { c++; continue }
      let len = 1
      while (c + len < GRID_SIZE && grid[r][c + len]?.type.id === grid[r][c]!.type.id) len++
      if (len >= MIN_MATCH) hRuns.push({ r, c, len })
      c += len
    }
  }
  for (let c = 0; c < GRID_SIZE; c++) {
    let r = 0
    while (r < GRID_SIZE) {
      if (!grid[r][c]) { r++; continue }
      let len = 1
      while (r + len < GRID_SIZE && grid[r + len][c]?.type.id === grid[r][c]!.type.id) len++
      if (len >= MIN_MATCH) vRuns.push({ r, c, len })
      r += len
    }
  }
  return { hRuns, vRuns }
}

function computeRemoval(
  grid: Cell[][],
  swapKey?: string
): { toRemove: Set<string>; toCreate: Map<string, SpecialType> } | null {
  const { hRuns, vRuns } = findRuns(grid)
  if (!hRuns.length && !vRuns.length) return null

  const toRemove = new Set<string>()
  const toCreate = new Map<string, SpecialType>()

  hRuns.forEach(({ r, c, len }) => { for (let i = 0; i < len; i++) toRemove.add(`${r},${c + i}`) })
  vRuns.forEach(({ r, c, len }) => { for (let i = 0; i < len; i++) toRemove.add(`${r + i},${c}`) })

  // Detect T/L intersections
  const hSet = new Set<string>()
  const vSet = new Set<string>()
  hRuns.forEach(({ r, c, len }) => { for (let i = 0; i < len; i++) hSet.add(`${r},${c + i}`) })
  vRuns.forEach(({ r, c, len }) => { for (let i = 0; i < len; i++) vSet.add(`${r + i},${c}`) })
  const intersect = new Set([...hSet].filter(k => vSet.has(k)))

  const pick = (keys: string[]) =>
    swapKey && keys.includes(swapKey) ? swapKey : keys[Math.floor(keys.length / 2)]

  hRuns.forEach(({ r, c, len }) => {
    if (len < 4) return
    const keys = Array.from({ length: len }, (_, i) => `${r},${c + i}`)
    const pos = pick(keys)
    const sp: SpecialType = intersect.has(pos) || len >= 5 ? 'bomb' : 'striped-h'
    if (!toCreate.has(pos) || sp === 'bomb') toCreate.set(pos, sp)
  })
  vRuns.forEach(({ r, c, len }) => {
    if (len < 4) return
    const keys = Array.from({ length: len }, (_, i) => `${r + i},${c}`)
    const pos = pick(keys)
    if (toCreate.has(pos)) return
    const sp: SpecialType = intersect.has(pos) || len >= 5 ? 'bomb' : 'striped-v'
    toCreate.set(pos, sp)
  })

  // Expand board specials already placed
  let changed = true
  while (changed) {
    changed = false
    toRemove.forEach(key => {
      const [r, c] = key.split(',').map(Number)
      const cell = grid[r]?.[c]
      if (!cell?.special) return
      const add = (k: string) => { if (!toRemove.has(k)) { toRemove.add(k); changed = true } }
      if (cell.special === 'striped-h') {
        for (let cc = 0; cc < GRID_SIZE; cc++) add(`${r},${cc}`)
      } else if (cell.special === 'striped-v') {
        for (let rr = 0; rr < GRID_SIZE; rr++) add(`${rr},${c}`)
      } else if (cell.special === 'bomb') {
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr, nc = c + dc
            if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) add(`${nr},${nc}`)
          }
      }
    })
  }

  return { toRemove, toCreate }
}

function hasValidMove(grid: Cell[][]): boolean {
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (c + 1 < GRID_SIZE) {
        const g = grid.map(row => [...row])
        ;[g[r][c], g[r][c + 1]] = [g[r][c + 1], g[r][c]]
        const { hRuns, vRuns } = findRuns(g)
        if (hRuns.length || vRuns.length) return true
      }
      if (r + 1 < GRID_SIZE) {
        const g = grid.map(row => [...row])
        ;[g[r][c], g[r + 1][c]] = [g[r + 1][c], g[r][c]]
        const { hRuns, vRuns } = findRuns(g)
        if (hRuns.length || vRuns.length) return true
      }
    }
  }
  return false
}

export function useBreadEngine() {
  const [grid, setGrid] = useState<Cell[][]>([])
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [movesLeft, setMovesLeft] = useState(MAX_MOVES)
  const [isProcessing, setIsProcessing] = useState(false)
  const [gameState, setGameState] = useState<GameState>('playing')
  const [lastMatchPos, setLastMatchPos] = useState<{ r: number; c: number } | null>(null)
  const [particles, setParticles] = useState<Particle[]>([])

  const busyRef = useRef(false)
  const scoreRef = useRef(0)
  const movesRef = useRef(MAX_MOVES)

  const spawnParticles = useCallback((keys: string[]) => {
    const ps: Particle[] = keys.slice(0, 20).map(key => {
      const [r, c] = key.split(',').map(Number)
      return {
        id: `p-${Math.random().toString(36).slice(2)}`,
        r, c,
        color: BREAD_TYPES[Math.floor(Math.random() * BREAD_TYPES.length)].glowColor,
        dx: (Math.random() - 0.5) * 90,
        dy: (Math.random() - 0.5) * 90,
      }
    })
    setParticles(prev => [...prev, ...ps])
    const ids = new Set(ps.map(p => p.id))
    setTimeout(() => setParticles(prev => prev.filter(p => !ids.has(p.id))), 900)
  }, [])

  const runBoard = useCallback(async (g: Cell[][], firstSwapKey?: string) => {
    let cur = g.map(row => row.map(c => c ? { ...c } : null))
    let roundCombo = 0
    let swapKey = firstSwapKey

    while (true) {
      const res = computeRemoval(cur, swapKey)
      swapKey = undefined
      if (!res) break

      roundCombo++
      setCombo(roundCombo)

      const pts = res.toRemove.size * 10 * roundCombo
      scoreRef.current += pts
      setScore(scoreRef.current)

      const matchArr = Array.from(res.toRemove)
      setLastMatchPos({ r: +matchArr[0].split(',')[0], c: +matchArr[0].split(',')[1] })
      spawnParticles(matchArr)

      // Place specials before removal
      res.toCreate.forEach((special, key) => {
        const [r, c] = key.split(',').map(Number)
        if (cur[r][c]) cur[r][c] = { ...cur[r][c]!, special, id: `sp-${Math.random().toString(36).slice(2)}` }
      })

      // Remove matched cells (keep new specials)
      res.toRemove.forEach(key => {
        if (res.toCreate.has(key)) return
        const [r, c] = key.split(',').map(Number)
        cur[r][c] = null
      })

      setGrid(cur.map(row => [...row]))
      await new Promise(r => setTimeout(r, 400))

      // Gravity
      for (let c = 0; c < GRID_SIZE; c++) {
        let empty = GRID_SIZE - 1
        for (let r = GRID_SIZE - 1; r >= 0; r--) {
          if (cur[r][c]) {
            if (r !== empty) { cur[empty][c] = cur[r][c]; cur[r][c] = null }
            empty--
          }
        }
      }
      setGrid(cur.map(row => [...row]))
      await new Promise(r => setTimeout(r, 250))

      // Refill
      for (let r = 0; r < GRID_SIZE; r++)
        for (let c = 0; c < GRID_SIZE; c++)
          if (!cur[r][c]) cur[r][c] = mkCell()

      setGrid(cur.map(row => [...row]))
      setLastMatchPos(null)
      await new Promise(r => setTimeout(r, 350))
    }

    setCombo(0)

    // Shuffle if no valid moves
    if (!hasValidMove(cur)) {
      const flat = cur.flat()
      for (let i = flat.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[flat[i], flat[j]] = [flat[j], flat[i]]
      }
      cur = Array.from({ length: GRID_SIZE }, (_, r) =>
        Array.from({ length: GRID_SIZE }, (_, c) => flat[r * GRID_SIZE + c])
      )
      setGrid(cur.map(row => [...row]))
      await new Promise(r => setTimeout(r, 500))
    }

    return cur
  }, [spawnParticles])

  const initBoard = useCallback(async () => {
    if (busyRef.current) return
    const g: Cell[][] = Array.from({ length: GRID_SIZE }, () =>
      Array.from({ length: GRID_SIZE }, () => mkCell())
    )
    setGrid(g)
    setScore(0); scoreRef.current = 0
    setCombo(0)
    setMovesLeft(MAX_MOVES); movesRef.current = MAX_MOVES
    setGameState('playing')
    setParticles([])
    busyRef.current = true
    setIsProcessing(true)
    await new Promise(r => setTimeout(r, 200))
    await runBoard(g)
    busyRef.current = false
    setIsProcessing(false)
  }, [runBoard])

  const handleSwap = useCallback(async (
    r1: number, c1: number, r2: number, c2: number
  ): Promise<boolean> => {
    if (busyRef.current || movesRef.current <= 0) return false

    const newGrid = grid.map(row => row.map(c => c ? { ...c } : null))
    ;[newGrid[r1][c1], newGrid[r2][c2]] = [newGrid[r2][c2], newGrid[r1][c1]]

    if (!computeRemoval(newGrid)) return false

    const newMoves = movesRef.current - 1
    movesRef.current = newMoves
    setMovesLeft(newMoves)

    busyRef.current = true
    setIsProcessing(true)
    setGrid(newGrid.map(row => [...row]))

    await runBoard(newGrid, `${r2},${c2}`)

    busyRef.current = false
    setIsProcessing(false)

    if (newMoves <= 0) {
      setGameState(scoreRef.current >= WIN_SCORE ? 'won' : 'lost')
    }

    return true
  }, [grid, runBoard])

  return {
    grid, score, combo, movesLeft, isProcessing,
    gameState, lastMatchPos, particles,
    handleSwap, initBoard,
  }
}
