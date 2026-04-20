'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { X } from 'lucide-react'

// ── 앱 테마 토큰 ──────────────────────────────────────────────
const T = {
  bg:       '#0A0C0F',
  surface:  '#111418',
  surface2: '#181C22',
  border:   '#1E2430',
  border2:  '#252D3A',
  text:     '#EEF0F4',
  text2:    '#8892A0',
  text3:    '#4A5568',
  gradient: 'linear-gradient(135deg,#FF3D78,#9B2FC9)',
  neonY:    '#FFD700',
  neonO:    '#FF8C00',
  neonC:    '#00FFFF',
  up:       '#FF5C5C',
}

const TITLE_GRADIENT = 'linear-gradient(135deg,#FF3D78,#9B2FC9)'

const marqueeCSS = `
@keyframes galaga-marquee {
  0%   { transform: translateX(100%); }
  100% { transform: translateX(-100%); }
}
`

// ── 게임 상수 ─────────────────────────────────────────────────
const W = 480, H = 520
const FORM_ROWS = 5, FORM_COLS = 8
const FORM_X0 = 60, FORM_Y0 = 58, FORM_DX = 48, FORM_DY = 36
const TYPE_COLORS = ['#FFD700', '#00FFFF', '#FF4444']
const TYPE_POINTS = [100, 160, 400]

type GS = 'start' | 'play' | 'gameover'
interface V2 { x: number; y: number }
interface Star { x: number; y: number; speed: number; r: number; b: number }
interface Bullet { x: number; y: number; vy: number; h: number }
interface EBullet { x: number; y: number; vx: number; vy: number }
interface Enemy {
  id: number; fx: number; fy: number; x: number; y: number
  alive: boolean; type: number
  state: 'entering' | 'formed' | 'diving' | 'returning'
  path: V2[]; pathIdx: number; frame: number; entryDelay: number
}
interface Particle { x: number; y: number; vx: number; vy: number; life: number; col: string }
// 아이템 타입:
//  0=버터(실드) 1=잼(연사) 2=우유(2배점수) 3=바나나우유(2연발)
//  4=흰빵 5=골드빵 6=베이글 7=스페셜빵
interface Item { x: number; y: number; vy: number; type: number; frame: number }
const ITEM_DURATION = 60 * 3
const ITEM_COLORS   = ['#FFD700','#FF3D78','#AADDFF','#FFE135','#F5DEB3','#FFD700','#C8A96E','#FF69B4']
const ITEM_LABELS   = ['🧈','🍓','🥛','🍌','🍞','🍞','🥐','✨']
const ITEM_NAMES    = ['버터 실드','딸기잼 연사','우유 2배','바나나 2연발','흰빵','골드빵','베이글','스페셜빵']
const BREAD_POINTS  = [0,0,0,0, 100,200,350,600]  // 빵 타입별 획득 점수
const POWERUP_CHANCE = [0.04, 0.04, 0.03, 0.04]   // 파워업 개별 드롭 확률 (희귀)
const ENEMY_BREAD   = [4, 5, 6]  // 적 타입별 기본 빵: bee→흰빵, butterfly→골드빵, boss→베이글

// ── 게임 로직 유틸 ────────────────────────────────────────────
function makeStars(): Star[] {
  return Array.from({ length: 120 }, () => ({
    x: Math.random() * W, y: Math.random() * H,
    speed: 0.3 + Math.random() * 1.2,
    r: Math.random() * 1.2 + 0.2,
    b: Math.random(),
  }))
}

function makeEntryPath(e: Enemy, steps: number) {
  const side = e.x < 0 ? -1 : 1
  e.path = []
  for (let t = 0; t <= steps; t++) {
    const pct = t / steps
    const curve = side * Math.sin(pct * Math.PI) * 120
    e.path.push({ x: e.x + (e.fx - e.x) * pct + curve * (1 - pct), y: e.y + (e.fy - e.y) * pct })
  }
}

function makeDivePath(e: Enemy, steps: number) {
  // 아래로 내려가는 경로만 생성 (절반 스텝)
  const side = e.fx < W / 2 ? -1 : 1; e.path = []
  const half = Math.floor(steps / 2)
  for (let t = 0; t <= half; t++) {
    const p = t / half
    e.path.push({
      x: e.x + side * Math.sin(p * Math.PI) * 200,
      y: e.y + (H + 40 - e.y) * p,
    })
  }
}

function spawnFormation(stage: number) {
  const enemies: Enemy[] = []
  for (let r = 0; r < FORM_ROWS; r++)
    for (let c = 0; c < FORM_COLS; c++) {
      const type = r <= 1 ? 0 : r <= 3 ? 1 : 2
      enemies.push({
        id: r * FORM_COLS + c,
        fx: FORM_X0 + c * FORM_DX + (r % 2) * 10,
        fy: FORM_Y0 + r * FORM_DY,
        x: r * FORM_COLS + c < FORM_ROWS * FORM_COLS / 2 ? -30 : W + 30,
        y: -60 - r * 40,
        alive: true, type, state: 'entering',
        path: [], pathIdx: 0, frame: 0,
        entryDelay: (r * FORM_COLS + c) * 4,
      })
    }
  return { enemies, interval: Math.max(180, 300 - stage * 18) }  // 웨이브 간격 늘림
}

function hitRect(ax: number, ay: number, ar: number, bx: number, by: number, br: number) {
  return Math.abs(ax - bx) < ar + br && Math.abs(ay - by) < ar + br
}

// ── 컴포넌트 ──────────────────────────────────────────────────
export default function GalagaGame({
  onClose, userId = '', userName = '',
}: { onClose: () => void; userId?: string; userName?: string }) {

  const cvRef = useRef<HTMLCanvasElement>(null)

  // HUD state
  const [hudScore, setHudScore]   = useState(0)
  const [hudStage, setHudStage]   = useState(1)
  const [hudLives, setHudLives]   = useState(3)
  const [gstate, setGstate]       = useState<GS>('start')
  const [stageMsg, setStageMsg]   = useState('')
  const [showExit, setShowExit]   = useState(false)
  const [activeItems, setActiveItems] = useState<number[]>([])  // 현재 활성 아이템 타입들

  // 리더보드
  const [topPlayer, setTopPlayer] = useState<{ 사용자이름: string; 점수: number; 레벨?: number | null } | null>(null)
  const [myBest, setMyBest]         = useState(0)
  const [myBestStage, setMyBestStage] = useState(0)

  // ── game refs ─────────────────────────────────────────────
  const gsRef       = useRef<GS>('start')
  const scoreRef    = useRef(0)
  const stageRef    = useRef(1)
  const livesRef    = useRef(3)
  const tickRef     = useRef(0)
  const lastShotRef = useRef(0)
  const invincRef   = useRef(0)
  const waveTimerRef    = useRef(0)
  const waveIntervalRef = useRef(200)
  const formOscRef  = useRef(0)
  const myBestRef      = useRef(0)
  const myBestStageRef = useRef(0)

  const playerRef    = useRef({ x: W / 2, y: H - 50, speed: 4 })
  const bulletsRef   = useRef<Bullet[]>([])
  const ebulletsRef  = useRef<EBullet[]>([])
  const enemiesRef   = useRef<Enemy[]>([])
  const particlesRef = useRef<Particle[]>([])
  const starsRef     = useRef<Star[]>(makeStars())
  const itemsRef     = useRef<Item[]>([])
  const breadImgsRef = useRef<HTMLImageElement[]>([])

  useEffect(() => {
    const srcs = ['/sample-a.png', '/sample-b.png', '/sample-c.png', '/sample-d.png']
    breadImgsRef.current = srcs.map(src => {
      const img = new window.Image(); img.src = src; return img
    })
  }, [])

  // 파워업 타이머 (남은 틱, 0=비활성)
  const shieldRef    = useRef(0)   // 버터 — 실드
  const jamRef       = useRef(0)   // 잼   — 연사
  const milkRef      = useRef(0)   // 우유  — 2배점수
  const bananaRef    = useRef(0)   // 바나나 — 2연발
  // 자동발사 틱 카운터
  const autoFireTickRef = useRef(0)

  const keysRef    = useRef<Record<string, boolean>>({})
  const tLeftRef   = useRef(false)
  const tRightRef  = useRef(false)
  // 스와이프 추적
  const swipeRef   = useRef<{ startX: number; lastX: number; startTime: number } | null>(null)
  const rafRef    = useRef(0)
  const pausedRef = useRef(false)
  const lastTimeRef = useRef(0)   // 직전 프레임 타임스탬프
  const accumRef    = useRef(0)   // 누적 미처리 시간(ms)
  const TICK_MS = 1000 / 60       // 고정 논리 스텝 ≈16.667ms

  const userIdRef   = useRef(userId)
  const userNameRef = useRef(userName)
  useEffect(() => { userIdRef.current = userId }, [userId])
  useEffect(() => { userNameRef.current = userName }, [userName])

  // ── 리더보드 / 내 최고점수 로드 ──────────────────────────
  useEffect(() => {
    fetch('/api/game/leaderboard?game=galaga')
      .then(r => r.json()).then(d => { if (d.top) setTopPlayer(d.top) }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!userId) return
    fetch(`/api/game/score?game=galaga&userId=${encodeURIComponent(userId)}`)
      .then(r => r.json()).then(d => {
        if (d.data) {
          myBestRef.current = d.data.점수; setMyBest(d.data.점수)
          myBestStageRef.current = d.data.레벨 ?? 0; setMyBestStage(d.data.레벨 ?? 0)
        }
      }).catch(() => {})
  }, [userId])

  // ── HUD 업데이트 ─────────────────────────────────────────
  const updateHUD = useCallback(() => {
    setHudScore(scoreRef.current)
    setHudStage(stageRef.current)
    setHudLives(livesRef.current)
  }, [])

  // ── 파티클 폭발 ──────────────────────────────────────────
  const burst = useCallback((x: number, y: number, col: string, n = 10) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 3
      particlesRef.current.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 40 + Math.random() * 20, col })
    }
  }, [])

  // ── 아이템 드롭 ───────────────────────────────────────────
  const spawnItem = useCallback((x: number, y: number, enemyType: number) => {
    const stage = stageRef.current
    // 빵 드롭: 스테이지 오를수록 감소 (최소 15/25/50%)
    const baseBreadChance = [0.40, 0.55, 0.80][enemyType] ?? 0.40
    const breadChance = Math.max([0.15, 0.25, 0.50][enemyType] ?? 0.15, baseBreadChance - (stage - 1) * 0.025)
    if (Math.random() < breadChance) {
      let breadType = ENEMY_BREAD[enemyType] ?? 4
      if (enemyType === 2 && Math.random() < 0.25) breadType = 7  // boss 25% 스페셜
      itemsRef.current.push({ x, y, vy: 1.6, type: breadType, frame: 0 })
    }

    // 희귀 파워업: 스테이지 오를수록 감소 (최소 0.5%), 바나나 활성 중엔 바나나(type=3) 미드롭
    for (let t = 0; t < 4; t++) {
      if (t === 3 && bananaRef.current > 0) continue  // 2연발 중엔 바나나 드롭 안함
      const powerChance = Math.max(0.005, POWERUP_CHANCE[t] - (stage - 1) * 0.002)
      if (Math.random() < powerChance) {
        itemsRef.current.push({ x: x + (Math.random() - 0.5) * 20, y, vy: 1.4, type: t, frame: 0 })
        break
      }
    }
  }, [])

  // ── 점수 저장 ─────────────────────────────────────────────
  const saveScore = useCallback((score: number, stage: number) => {
    if (!userIdRef.current || score <= 0) return
    // 갱신 조건: 현재 STAGE > 최고 STAGE  OR  같은 STAGE에서 점수 높을 때
    const shouldUpdate =
      stage > myBestStageRef.current ||
      (stage === myBestStageRef.current && score > myBestRef.current)
    if (!shouldUpdate) return
    myBestRef.current = score
    myBestStageRef.current = stage
    setMyBest(score)
    setMyBestStage(stage)
    fetch('/api/game/score', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ 게임종류: 'galaga', 사용자아이디: userIdRef.current, 사용자이름: userNameRef.current, 점수: score, 레벨: stage }),
    }).then(r => r.json()).then(d => {
      if (d.updated) {
        fetch('/api/game/leaderboard?game=galaga')
          .then(r => r.json()).then(d => { if (d.top) setTopPlayer(d.top) }).catch(() => {})
      }
    }).catch(() => {})
  }, [])

  // ── 게임 시작 ─────────────────────────────────────────────
  const startGame = useCallback(() => {
    scoreRef.current = 0; stageRef.current = 1; livesRef.current = 3
    playerRef.current = { x: W / 2, y: H - 50, speed: 4 }
    bulletsRef.current = []; ebulletsRef.current = []; particlesRef.current = []; itemsRef.current = []
    shieldRef.current = 0; jamRef.current = 0; milkRef.current = 0; bananaRef.current = 0
    autoFireTickRef.current = 0
    const { enemies, interval } = spawnFormation(1)
    enemiesRef.current = enemies; waveIntervalRef.current = interval
    waveTimerRef.current = 0; invincRef.current = 0; tickRef.current = 0
    lastTimeRef.current = 0; accumRef.current = 0
    gsRef.current = 'play'; setGstate('play'); setStageMsg(''); setActiveItems([])
    updateHUD()
  }, [updateHUD])

  // ── 드로우 ───────────────────────────────────────────────
  const draw = useCallback((ctx: CanvasRenderingContext2D) => {
    const tick = tickRef.current
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H)

    // 별
    starsRef.current.forEach(s => {
      ctx.globalAlpha = 0.4 + 0.6 * s.b; ctx.fillStyle = '#fff'
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill()
    })
    ctx.globalAlpha = 1

    // 적 — 타입별로 묶어 shadowBlur 상태 전환 최소화
    const alive = enemiesRef.current.filter(e => e.alive)

    function drawEnemyShape(e: Enemy) {
      const wf0 = Math.sin(tick * 0.4 + e.id) * 4
      const wf1 = Math.sin(tick * 0.35 + e.id) * 5
      const wf2 = Math.sin(tick * 0.3 + e.id) * 3
      if (e.type === 0) {
        ctx.fillStyle = '#FFD700'
        ctx.beginPath(); ctx.ellipse(0, 0, 7, 9, 0, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = 'rgba(255,220,100,0.7)'
        ctx.beginPath(); ctx.ellipse(-10 + wf0, -2, 7, 5, Math.PI / 6, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.ellipse(10 - wf0, -2, 7, 5, -Math.PI / 6, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#ff0'; ctx.beginPath(); ctx.arc(0, -10, 4, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#000'
        ctx.beginPath(); ctx.arc(-2, -11, 1, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.arc(2, -11, 1, 0, Math.PI * 2); ctx.fill()
      } else if (e.type === 1) {
        ctx.fillStyle = '#00FFFF'
        ctx.beginPath(); ctx.ellipse(-11 + wf1, 0, 10, 7, Math.PI / 5, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.ellipse(11 - wf1, 0, 10, 7, -Math.PI / 5, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#0099bb'
        ctx.beginPath(); ctx.ellipse(-9 + wf1, 5, 7, 5, Math.PI / 4, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.ellipse(9 - wf1, 5, 7, 5, -Math.PI / 4, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#00ffff'; ctx.beginPath(); ctx.ellipse(0, 0, 4, 9, 0, 0, Math.PI * 2); ctx.fill()
      } else {
        ctx.fillStyle = 'rgba(255,100,0,0.7)'
        ctx.beginPath(); ctx.ellipse(-16 + wf2, 0, 13, 8, Math.PI / 7, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.ellipse(16 - wf2, 0, 13, 8, -Math.PI / 7, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#FF4444'
        ctx.beginPath(); ctx.ellipse(-10 + wf2, 4, 9, 6, Math.PI / 5, 0, Math.PI * 2); ctx.fill()
        ctx.beginPath(); ctx.ellipse(10 - wf2, 4, 9, 6, -Math.PI / 5, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#FF2222'
        ctx.beginPath(); ctx.moveTo(0, -12); ctx.lineTo(-6, 8); ctx.lineTo(6, 8); ctx.closePath(); ctx.fill()
        ctx.beginPath(); ctx.arc(0, -4, 6, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#ffff00'
        ctx.beginPath(); ctx.arc(-3, -5, 2, 0, Math.PI * 2); ctx.fill()
      }
    }

    // 타입 순서로 정렬해 shadowColor 전환 횟수 최소화
    const byType = [0, 1, 2]
    const glowColors = ['#FFD700', '#00FFFF', '#FF4444']
    byType.forEach(t => {
      ctx.shadowColor = glowColors[t]; ctx.shadowBlur = t === 2 ? 10 : 6
      alive.filter(e => e.type === t).forEach(e => {
        ctx.save(); ctx.translate(e.x, e.y)
        if (e.state === 'diving' && e.pathIdx < e.path.length - 1) {
          const nx = e.path[Math.min(e.pathIdx + 1, e.path.length - 1)]
          const dx = nx.x - e.x, dy = nx.y - e.y
          if (Math.abs(dx) + Math.abs(dy) > 0.5) ctx.rotate(Math.atan2(dy, dx) + Math.PI / 2)
        }
        drawEnemyShape(e)
        ctx.restore()
      })
    })
    ctx.shadowBlur = 0

    // 플레이어
    if (gsRef.current === 'play' || gsRef.current === 'gameover') {
      const shieldActive = shieldRef.current > 0
      // 버터 실드 링
      if (shieldActive) {
        const px = playerRef.current.x, py = playerRef.current.y
        const pulse = 0.6 + 0.4 * Math.sin(tick * 0.15)
        ctx.save()
        ctx.strokeStyle = `rgba(255,215,0,${pulse})`
        ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 14
        ctx.lineWidth = 2.5
        ctx.beginPath(); ctx.arc(px, py, 22, 0, Math.PI * 2); ctx.stroke()
        ctx.shadowBlur = 0; ctx.restore()
      }
      if (!(invincRef.current > 0 && Math.floor(invincRef.current / 5) % 2 === 0)) {
        const px = playerRef.current.x, py = playerRef.current.y
        ctx.save()
        ctx.fillStyle = 'rgba(0,200,255,0.2)'; ctx.beginPath(); ctx.ellipse(px, py + 14, 8, 5, 0, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#44aaff'; ctx.shadowColor = '#44aaff'; ctx.shadowBlur = 14
        ctx.beginPath()
        ctx.moveTo(px, py - 14); ctx.lineTo(px - 8, py + 4)
        ctx.lineTo(px - 4, py + 10); ctx.lineTo(px + 4, py + 10); ctx.lineTo(px + 8, py + 4)
        ctx.closePath(); ctx.fill()
        ctx.fillStyle = '#2266cc'
        ctx.beginPath(); ctx.moveTo(px - 8, py + 4); ctx.lineTo(px - 22, py + 12); ctx.lineTo(px - 6, py + 10); ctx.closePath(); ctx.fill()
        ctx.beginPath(); ctx.moveTo(px + 8, py + 4); ctx.lineTo(px + 22, py + 12); ctx.lineTo(px + 6, py + 10); ctx.closePath(); ctx.fill()
        ctx.fillStyle = '#aaddff'; ctx.beginPath(); ctx.ellipse(px, py - 4, 4, 5, 0, 0, Math.PI * 2); ctx.fill()
        const ef = 0.6 + 0.4 * Math.sin(tick * 0.3)
        ctx.fillStyle = `rgba(0,180,255,${ef})`
        ctx.beginPath(); ctx.moveTo(px - 4, py + 10); ctx.lineTo(px + 4, py + 10); ctx.lineTo(px, py + 16 + ef * 6); ctx.closePath(); ctx.fill()
        ctx.shadowBlur = 0; ctx.restore()
      }
    }

    // 플레이어 총알
    bulletsRef.current.forEach(b => {
      ctx.fillStyle = '#0ff'; ctx.shadowColor = '#0ff'; ctx.shadowBlur = 10
      ctx.fillRect(b.x - 1.5, b.y, 3, b.h); ctx.shadowBlur = 0
    })

    // 적 총알
    ebulletsRef.current.forEach(b => {
      ctx.fillStyle = '#ff4'; ctx.shadowColor = '#ff4'; ctx.shadowBlur = 7
      ctx.fillRect(b.x - 2, b.y, 4, 9); ctx.shadowBlur = 0
    })

    // ── 아이템 드롭 ──────────────────────────────────────────
    itemsRef.current.forEach(it => {
      const { x, y, type, frame } = it
      const bob = Math.sin(frame * 0.12) * 2
      ctx.save(); ctx.translate(x, y + bob)

      if (type >= 4) {
        // 🍞 빵 아이템 — 실제 이미지 사용
        const img = breadImgsRef.current[type - 4]
        const sz = type === 7 ? 30 : 24   // 스페셜빵은 약간 크게
        if (img?.complete && img.naturalWidth > 0) {
          ctx.shadowColor = ITEM_COLORS[type]; ctx.shadowBlur = 10
          ctx.drawImage(img, -sz / 2, -sz / 2, sz, sz)
          ctx.shadowBlur = 0
        } else {
          // 이미지 로드 전 폴백
          ctx.fillStyle = ITEM_COLORS[type]
          ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill()
        }
        // 점수 표시
        ctx.fillStyle = '#fff'; ctx.font = `bold 8px sans-serif`; ctx.textAlign = 'center'
        ctx.fillText(`+${BREAD_POINTS[type]}`, 0, sz / 2 + 9)
      } else if (type === 0) {
        // 버터
        ctx.shadowColor = '#FFD700'; ctx.shadowBlur = 8
        ctx.fillStyle = '#FFD700'; ctx.fillRect(-9, -7, 18, 14)
        ctx.fillStyle = '#FFF176'; ctx.fillRect(-6, -4, 6, 4)
        ctx.fillStyle = '#E6B800'; ctx.fillRect(-9, 5, 18, 2)
      } else if (type === 1) {
        // 딸기잼
        ctx.shadowColor = '#FF3D78'; ctx.shadowBlur = 8
        ctx.fillStyle = '#8B4513'; ctx.fillRect(-5, -10, 10, 4)
        ctx.fillStyle = '#FF3D78'
        ctx.beginPath(); ctx.roundRect(-7, -6, 14, 16, 3); ctx.fill()
        ctx.fillStyle = 'rgba(255,180,200,0.5)'; ctx.fillRect(-4, -3, 4, 6)
      } else if (type === 2) {
        // 우유
        ctx.shadowColor = '#AADDFF'; ctx.shadowBlur = 8
        ctx.fillStyle = '#FFFFFF'; ctx.fillRect(-8, -10, 16, 18)
        ctx.fillStyle = '#4A9EFF'; ctx.fillRect(-8, -10, 16, 6)
        ctx.fillStyle = '#003080'; ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'center'
        ctx.fillText('2x', 0, 4)
      } else {
        // 바나나우유
        ctx.shadowColor = '#FFE135'; ctx.shadowBlur = 8
        ctx.fillStyle = '#FFE135'; ctx.fillRect(-8, -10, 16, 18)
        ctx.fillStyle = '#E6B800'; ctx.fillRect(-8, -10, 16, 5)
        ctx.strokeStyle = '#8B6914'; ctx.lineWidth = 2
        ctx.beginPath(); ctx.arc(0, -1, 5, Math.PI, 0); ctx.stroke()
        ctx.lineWidth = 1
      }

      ctx.shadowBlur = 0; ctx.restore()
    })

    // 파티클
    particlesRef.current.forEach(p => {
      ctx.globalAlpha = p.life / 60; ctx.fillStyle = p.col
      ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill()
    })
    ctx.globalAlpha = 1

    // 시작 화면
    if (gsRef.current === 'start') {
      ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(0, 0, W, H)
      // 타이틀 그라디언트 텍스트
      const tg = ctx.createLinearGradient(W/2 - 120, 0, W/2 + 120, 0)
      tg.addColorStop(0, '#FF3D78'); tg.addColorStop(1, '#9B2FC9')
      ctx.fillStyle = tg; ctx.shadowColor = '#FF3D78'; ctx.shadowBlur = 24
      ctx.font = 'bold 36px sans-serif'; ctx.textAlign = 'center'
      ctx.fillText('Galag-Bread', W / 2, H / 2 - 32); ctx.shadowBlur = 0
      ctx.fillStyle = '#9B2FC9'; ctx.font = '14px sans-serif'
      ctx.fillText('갤러그레드', W / 2, H / 2 - 8)
      ctx.fillStyle = T.neonY; ctx.font = '13px sans-serif'
      ctx.fillText('PRESS SPACE OR TAP TO START', W / 2, H / 2 + 20)
      ctx.fillStyle = T.text3; ctx.font = '11px sans-serif'
      ctx.fillText('SWIPE: MOVE  |  AUTO FIRE', W / 2, H / 2 + 44)
      ctx.textAlign = 'left'
    }
  }, [])

  // ── 업데이트 ─────────────────────────────────────────────
  const update = useCallback(() => {
    if (gsRef.current !== 'play') return
    tickRef.current++
    const stage = stageRef.current
    const entrySteps  = Math.max(80,  160 - (stage - 1) * 8)   // st1:160 → st10:88 → min80
    const diveSteps   = Math.max(150, 330 - (stage - 1) * 18)  // st1:330 → st10:168 → min150
    const returnSpeed = Math.min(4.5, 1.8 + (stage - 1) * 0.15) // st1:1.8 → st10:3.15 → max4.5
    const oscSpeed    = Math.min(0.018, 0.004 + (stage - 1) * 0.001) // st1:0.004 → st14:0.017
    formOscRef.current += oscSpeed

    starsRef.current.forEach(s => { s.y += s.speed; if (s.y > H) { s.y = 0; s.x = Math.random() * W } })

    const p = playerRef.current
    if ((keysRef.current['ArrowLeft'] || tLeftRef.current) && p.x > 20) p.x -= p.speed
    if ((keysRef.current['ArrowRight'] || tRightRef.current) && p.x < W - 20) p.x += p.speed
    if (invincRef.current > 0) invincRef.current--

    // ── 파워업 타이머 카운트다운 ────────────────────────────
    let powerChanged = false
    if (shieldRef.current  > 0) { shieldRef.current--;  if (shieldRef.current  === 0) powerChanged = true }
    if (jamRef.current     > 0) { jamRef.current--;     if (jamRef.current     === 0) powerChanged = true }
    if (milkRef.current    > 0) { milkRef.current--;    if (milkRef.current    === 0) powerChanged = true }
    if (bananaRef.current  > 0) { bananaRef.current--;  if (bananaRef.current  === 0) powerChanged = true }
    if (powerChanged) {
      const active: number[] = []
      if (shieldRef.current > 0) active.push(0)
      if (jamRef.current    > 0) active.push(1)
      if (milkRef.current   > 0) active.push(2)
      if (bananaRef.current > 0) active.push(3)
      setActiveItems(active)
    }

    // ── 자동 발사 ───────────────────────────────────────────
    const fireCooldown = jamRef.current > 0 ? 8 : 18  // 잼: 빠른 연사
    autoFireTickRef.current++
    if (autoFireTickRef.current >= fireCooldown) {
      autoFireTickRef.current = 0
      const px = playerRef.current.x, py = playerRef.current.y - 14
      if (bananaRef.current > 0) {
        // 바나나우유: 좌우 2연발
        bulletsRef.current.push({ x: px - 7, y: py, vy: -11, h: 12 })
        bulletsRef.current.push({ x: px + 7, y: py, vy: -11, h: 12 })
      } else {
        bulletsRef.current.push({ x: px, y: py, vy: -11, h: 12 })
      }
    }

    // ── 아이템 이동 & 수집 ──────────────────────────────────
    itemsRef.current = itemsRef.current.filter(it => {
      it.y += it.vy; it.frame++
      if (it.y > H + 20) return false
      if (hitRect(it.x, it.y, 10, p.x, p.y, 16)) {
        if (it.type >= 4) {
          // 빵 수집 → 점수 (우유 활성시 2배)
          const pts = BREAD_POINTS[it.type] * (milkRef.current > 0 ? 2 : 1)
          scoreRef.current += pts
          updateHUD()
        } else {
          // 파워업 수집
          if (it.type === 0) shieldRef.current = ITEM_DURATION
          if (it.type === 1) jamRef.current    = ITEM_DURATION
          if (it.type === 2) milkRef.current   = ITEM_DURATION
          if (it.type === 3) bananaRef.current = ITEM_DURATION
          const active: number[] = []
          if (shieldRef.current > 0) active.push(0)
          if (jamRef.current    > 0) active.push(1)
          if (milkRef.current   > 0) active.push(2)
          if (bananaRef.current > 0) active.push(3)
          setActiveItems(active)
        }
        burst(it.x, it.y, ITEM_COLORS[it.type], 14)
        return false
      }
      return true
    })

    bulletsRef.current  = bulletsRef.current.filter(b => { b.y += b.vy; return b.y > -10 })
    ebulletsRef.current = ebulletsRef.current.filter(b => { b.y += b.vy; b.x += b.vx; return b.y < H + 10 })

    const fo = formOscRef.current
    enemiesRef.current.filter(e => e.alive).forEach(e => {
      e.frame++
      if (e.state === 'entering') {
        if (e.entryDelay > 0) { e.entryDelay--; return }
        if (!e.path.length) makeEntryPath(e, entrySteps)
        if (e.pathIdx < e.path.length) {
          const pt = e.path[e.pathIdx++]; e.x = pt.x; e.y = pt.y
        } else { e.x = e.fx; e.y = e.fy; e.state = 'formed'; e.path = []; e.pathIdx = 0 }
      } else if (e.state === 'formed') {
        e.x = e.fx + Math.sin(fo + e.id * 0.4) * 8
        e.y = e.fy + Math.cos(fo * 0.7 + e.id * 0.3) * 4
      } else if (e.state === 'diving') {
        if (e.pathIdx < e.path.length) {
          const pt = e.path[e.pathIdx++]; e.x = pt.x; e.y = pt.y
          const bulletInterval = Math.max(15, 50 - (stageRef.current - 1) * 3)
          if (e.pathIdx % bulletInterval === Math.floor(bulletInterval / 2) && e.y > 0 && e.y < H) {
            const angle = Math.atan2(p.y - e.y, p.x - e.x)
            ebulletsRef.current.push({ x: e.x, y: e.y, vx: Math.cos(angle) * 2.4, vy: Math.sin(angle) * 2.4 + 0.8 })
          }
        } else {
          // 다이브 완료: 노랑(bee)만 아주 가끔 아래서 위로 복귀, 나머지는 맨 위에서 등장
          if (e.type === 0 && Math.random() < 0.12) {
            // 노랑 bee: 현재 위치(화면 아래)에서 그대로 편대로 직선 복귀 (총 안 쏨)
          } else {
            // 맨 위에서 편대 x위치로 등장
            e.x = e.fx; e.y = -40
          }
          e.state = 'returning'; e.path = []; e.pathIdx = 0
        }
      } else if (e.state === 'returning') {
        const dx = e.fx - e.x, dy = e.fy - e.y, d = Math.sqrt(dx * dx + dy * dy)
        if (d < 3) { e.x = e.fx; e.y = e.fy; e.state = 'formed' }
        else { e.x += dx / d * returnSpeed; e.y += dy / d * returnSpeed }
      }
    })

    // 웨이브 다이브
    waveTimerRef.current++
    const formed = enemiesRef.current.filter(e => e.alive && e.state === 'formed')
    if (formed.length > 0 && waveTimerRef.current > waveIntervalRef.current) {
      waveTimerRef.current = 0
      const count = Math.min(2 + Math.floor(stageRef.current / 2), 4)
      for (let i = 0; i < count; i++) {
        const idx = Math.floor(Math.random() * formed.length)
        const diver = formed[idx]
        if (diver) { makeDivePath(diver, diveSteps); diver.state = 'diving'; diver.pathIdx = 0; formed.splice(idx, 1) }
      }
    }

    // 총알 vs 적
    bulletsRef.current.forEach(b => {
      enemiesRef.current.filter(e => e.alive).forEach(e => {
        if (hitRect(b.x, b.y, 6, e.x, e.y, 12)) {
          e.alive = false; b.y = -999
          burst(e.x, e.y, TYPE_COLORS[e.type], 12)
          spawnItem(e.x, e.y, e.type)
          updateHUD()
        }
      })
    })

    // 바나나 2연발 해제 헬퍼 (하트 감소 없이 2연발만 해제)
    const breakBanana = () => {
      bananaRef.current = 0
      const active: number[] = []
      if (shieldRef.current > 0) active.push(0)
      if (jamRef.current    > 0) active.push(1)
      if (milkRef.current   > 0) active.push(2)
      setActiveItems(active)
      invincRef.current = 120
      burst(p.x, p.y, '#FFE135', 16)
    }

    // 적 vs 플레이어 (실드 활성 시 무적)
    if (invincRef.current <= 0 && shieldRef.current <= 0) {
      ebulletsRef.current.forEach(b => {
        if (hitRect(b.x, b.y, 6, p.x, p.y, 12)) {
          b.y = H + 999
          if (bananaRef.current > 0) {
            breakBanana()
          } else {
            burst(p.x, p.y, '#4af', 14)
            livesRef.current--; updateHUD()
            if (livesRef.current <= 0) {
              gsRef.current = 'gameover'; setGstate('gameover')
              saveScore(scoreRef.current, stageRef.current)
            } else invincRef.current = 180
          }
        }
      })
      enemiesRef.current.filter(e => e.alive && (e.state === 'diving' || e.state === 'returning')).forEach(e => {
        if (hitRect(e.x, e.y, 10, p.x, p.y, 12)) {
          e.alive = false
          if (bananaRef.current > 0) {
            breakBanana()
          } else {
            burst(p.x, p.y, '#4af', 14)
            livesRef.current--; updateHUD()
            if (livesRef.current <= 0) {
              gsRef.current = 'gameover'; setGstate('gameover')
              saveScore(scoreRef.current, stageRef.current)
            } else invincRef.current = 180
          }
        }
      })
    }

    // 전멸 → 다음 스테이지
    if (enemiesRef.current.every(e => !e.alive)) {
      stageRef.current++
      bulletsRef.current = []; ebulletsRef.current = []; particlesRef.current = []
      playerRef.current = { x: W / 2, y: H - 50, speed: 4 }
      const { enemies: ne, interval } = spawnFormation(stageRef.current)
      enemiesRef.current = ne; waveIntervalRef.current = interval; waveTimerRef.current = 0
      setStageMsg(`STAGE ${stageRef.current}`); setTimeout(() => setStageMsg(''), 1600)
      updateHUD()
    }

    particlesRef.current = particlesRef.current.filter(pt => {
      pt.x += pt.vx; pt.y += pt.vy; pt.vy += 0.08; pt.life--; return pt.life > 0
    })
  }, [burst, updateHUD, saveScore, spawnItem])

  // ── 게임 루프 (고정 60FPS 타임스텝) ─────────────────────
  const loop = useCallback((timestamp: number) => {
    rafRef.current = requestAnimationFrame(loop)

    const ctx = cvRef.current?.getContext('2d')
    if (!ctx) return

    // 첫 프레임 초기화
    if (lastTimeRef.current === 0) lastTimeRef.current = timestamp

    const delta = Math.min(timestamp - lastTimeRef.current, 100) // 최대 100ms 클램프(탭 전환 복귀 등)
    lastTimeRef.current = timestamp

    if (!pausedRef.current) {
      accumRef.current += delta
      // 누적 시간을 60FPS 스텝 단위로 소비 (최대 3스텝 처리로 스파이크 방지)
      let steps = 0
      while (accumRef.current >= TICK_MS && steps < 3) {
        update()
        accumRef.current -= TICK_MS
        steps++
      }
    }

    draw(ctx)
  }, [update, draw, TICK_MS])

  useEffect(() => {
    lastTimeRef.current = 0
    accumRef.current = 0
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [loop])

  // ── 키보드 ───────────────────────────────────────────────
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      keysRef.current[e.code] = true
      if (['ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault()
      if (e.code === 'Space') { if (gsRef.current !== 'play') startGame() }
    }
    const onUp = (e: KeyboardEvent) => { keysRef.current[e.code] = false }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp) }
  }, [startGame])

  // ── 뒤로가기 ─────────────────────────────────────────────
  useEffect(() => {
    window.history.pushState({ galaga: true }, '')
    const onPop = () => { pausedRef.current = true; setShowExit(true) }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // ── 터치 (스와이프 이동 + 탭 발사) ──────────────────────
  const onTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    if (gsRef.current !== 'play') { startGame(); return }
    const t = e.touches[0]
    swipeRef.current = { startX: t.clientX, lastX: t.clientX, startTime: Date.now() }
  }

  const onTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    if (!swipeRef.current || gsRef.current !== 'play') return
    const rect = cvRef.current!.getBoundingClientRect()
    const scale = W / rect.width                          // canvas ↔ 화면 비율
    const dx = (e.touches[0].clientX - swipeRef.current.lastX) * scale * 1.6
    playerRef.current.x = Math.max(20, Math.min(W - 20, playerRef.current.x + dx))
    swipeRef.current.lastX = e.touches[0].clientX
  }

  const onTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!swipeRef.current) return
    const totalDx = Math.abs(e.changedTouches[0].clientX - swipeRef.current.startX)
    const dt = Date.now() - swipeRef.current.startTime
    swipeRef.current = null  // 자동발사이므로 탭 별도 처리 불필요
    tLeftRef.current = false; tRightRef.current = false
  }

  function confirmExit() { setShowExit(false); onClose() }
  function cancelExit() {
    setShowExit(false); pausedRef.current = false
    window.history.pushState({ galaga: true }, '')
  }

  // ── 렌더 ─────────────────────────────────────────────────
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500,
      background: T.bg,
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      overscrollBehavior: 'none', overflow: 'hidden',
      height: '100dvh',
    }}>
      <style>{marqueeCSS}</style>

      {/* ── 헤더 ─────────────────────────────────────────── */}
      <div style={{
        width: '100%', flexShrink: 0,
        background: T.surface,
        borderBottom: `1px solid ${T.border}`,
        padding: '10px 14px 8px',
        boxSizing: 'border-box',
      }}>
        {/* 타이틀 행 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1, overflow: 'hidden' }}>
            {/* 타이틀 */}
            <span style={{ fontSize: 15, fontWeight: 900, letterSpacing: 2, flexShrink: 0,
              background: TITLE_GRADIENT,
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
            }}>Galag-Bread</span>
            <span style={{ fontSize: 10, color: '#9B2FC9', fontWeight: 700, flexShrink: 0 }}>갤러그레드</span>

            {/* 전체 1위 마퀴 */}
            {topPlayer && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 4,
                flexShrink: 1, minWidth: 0,
                background: 'rgba(255,215,0,0.08)', border: `1px solid rgba(255,215,0,0.22)`,
                borderRadius: 6, padding: '2px 8px', overflow: 'hidden', maxWidth: 160,
              }}>
                <span style={{ fontSize: 10, flexShrink: 0 }}>🏆</span>
                <div style={{ overflow: 'hidden', flex: 1, minWidth: 0 }}>
                  <div style={{
                    display: 'inline-block', whiteSpace: 'nowrap',
                    animation: 'galaga-marquee 6s linear infinite',
                    fontSize: 10, fontWeight: 700,
                  }}>
                    <span style={{ color: T.text2 }}>{topPlayer.사용자이름}</span>
                    <span style={{ color: T.neonY, marginLeft: 6 }}>{topPlayer.점수.toLocaleString()}</span>
                    {topPlayer.레벨 && <span style={{ color: '#9B2FC9', marginLeft: 4, fontSize: 9, fontWeight: 700 }}>St.{topPlayer.레벨}</span>}
                    <span style={{ marginLeft: 18, color: T.text2 }}>{topPlayer.사용자이름}</span>
                    <span style={{ color: T.neonY, marginLeft: 6 }}>{topPlayer.점수.toLocaleString()}</span>
                    {topPlayer.레벨 && <span style={{ color: '#9B2FC9', marginLeft: 4, fontSize: 9, fontWeight: 700 }}>St.{topPlayer.레벨}</span>}
                  </div>
                </div>
              </div>
            )}

            {/* 내 최고점수 */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
              background: 'rgba(255,61,120,0.07)', border: '1px solid rgba(255,61,120,0.25)',
              borderRadius: 6, padding: '2px 8px',
            }}>
              <span style={{ fontSize: 9, color: '#FF3D78', fontWeight: 700 }}>BEST</span>
              <span style={{ fontSize: 12, fontWeight: 900, color: '#FF3D78',
                textShadow: myBest > 0 ? '0 0 8px rgba(255,61,120,0.5)' : 'none',
              }}>
                {myBest > 0 ? myBest.toLocaleString() : '-'}
              </span>
              {myBestStage > 0 && (
                <span style={{ fontSize: 9, color: '#9B2FC9', fontWeight: 700 }}>
                  St.{myBestStage}
                </span>
              )}
            </div>
          </div>

          {/* 닫기 */}
          <button
            onPointerDown={e => { e.preventDefault(); pausedRef.current = true; setShowExit(true) }}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.text3, padding: 4, display: 'flex', flexShrink: 0 }}
          >
            <X size={16} />
          </button>
        </div>

        {/* 스탯 행 */}
        <div style={{ display: 'flex', gap: 8 }}>
          {/* SCORE */}
          <div style={{
            flex: 2, background: T.surface2, borderRadius: 10, padding: '7px 12px',
            border: `1px solid ${T.border2}`,
          }}>
            <div style={{ fontSize: 9, color: T.text3, fontWeight: 700, letterSpacing: '0.1em' }}>SCORE</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: T.neonY, textShadow: '0 0 10px rgba(255,215,0,0.5)', lineHeight: 1.1 }}>
              {hudScore.toLocaleString()}
            </div>
          </div>
          {/* STAGE */}
          <div style={{
            flex: 1, background: T.surface2, borderRadius: 10, padding: '7px 12px',
            border: `1px solid ${T.border2}`,
          }}>
            <div style={{ fontSize: 9, color: T.text3, fontWeight: 700, letterSpacing: '0.1em' }}>STAGE</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#9B2FC9', lineHeight: 1.1 }}>{hudStage}</div>
          </div>
          {/* LIVES */}
          <div style={{
            flex: 1, background: T.surface2, borderRadius: 10, padding: '7px 12px',
            border: `1px solid ${hudLives <= 1 ? 'rgba(255,92,92,0.4)' : T.border2}`,
          }}>
            <div style={{ fontSize: 9, color: T.text3, fontWeight: 700, letterSpacing: '0.1em' }}>LIVES</div>
            <div style={{ display: 'flex', gap: 3, marginTop: 2 }}>
              {Array.from({ length: 3 }).map((_, i) => (
                <span key={i} style={{ fontSize: 12, opacity: i < hudLives ? 1 : 0.15, color: '#FF3D78' }}>❤</span>
              ))}
            </div>
          </div>
        </div>

        {/* 파워업 아이템 현황 */}
        {activeItems.length > 0 && (
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            {activeItems.map(t => (
              <div key={t} style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: `${ITEM_COLORS[t]}18`,
                border: `1px solid ${ITEM_COLORS[t]}55`,
                borderRadius: 8, padding: '3px 8px', fontSize: 11, fontWeight: 700,
                color: ITEM_COLORS[t] === '#FFFFFF' ? '#AADDFF' : ITEM_COLORS[t],
              }}>
                <span style={{ fontSize: 13 }}>{ITEM_LABELS[t]}</span>
                <span>{ITEM_NAMES[t]}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── 스테이지 메시지 ──────────────────────────────── */}
      {stageMsg && (
        <div style={{
          position: 'absolute', top: '42%', left: '50%', transform: 'translate(-50%,-50%)',
          color: T.neonY, fontSize: 24, fontWeight: 900, letterSpacing: 5,
          textShadow: `0 0 24px ${T.neonY}`, zIndex: 10, pointerEvents: 'none',
          fontFamily: '"Courier New",monospace',
        }}>
          {stageMsg}
        </div>
      )}

      {/* ── 게임오버 오버레이 ────────────────────────────── */}
      {gstate === 'gameover' && (
        <div style={{
          position: 'absolute', top: '42%', left: '50%', transform: 'translate(-50%,-50%)',
          textAlign: 'center', zIndex: 10, pointerEvents: 'none',
          fontFamily: '"Courier New",monospace',
        }}>
          <div style={{ color: '#FF4444', fontSize: 26, fontWeight: 900, letterSpacing: 4,
            textShadow: '0 0 20px #FF4444', marginBottom: 8 }}>GAME OVER</div>
          <div style={{ color: T.neonY, fontSize: 14, letterSpacing: 2 }}>
            SCORE: {hudScore.toLocaleString()}
          </div>
          {hudScore > 0 && myBest > 0 && hudScore >= myBest && (
            <div style={{ color: T.neonO, fontSize: 11, marginTop: 6, letterSpacing: 1 }}>🏆 최고기록 갱신!</div>
          )}
          <div style={{ color: T.text3, fontSize: 11, marginTop: 10 }}>SPACE / TAP TO RESTART</div>
        </div>
      )}

      {/* ── 캔버스 ───────────────────────────────────────── */}
      <canvas
        ref={cvRef}
        width={W}
        height={H}
        style={{ display: 'block', background: '#000', maxWidth: '100%', flex: 1, minHeight: 0, touchAction: 'none' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={() => { if (gsRef.current !== 'play') startGame() }}
      />

      {/* ── 모바일 조작 ──────────────────────────────────── */}
      <div style={{
        width: '100%', display: 'flex', flexShrink: 0,
        background: T.surface, borderTop: `1px solid ${T.border}`,
      }}>
        <button
          onPointerDown={e => { e.preventDefault(); tLeftRef.current = true }}
          onPointerUp={() => tLeftRef.current = false}
          onPointerLeave={() => tLeftRef.current = false}
          style={{
            flex: 1, padding: '13px 0',
            background: 'rgba(255,61,120,0.05)', border: 'none', borderRight: `1px solid ${T.border}`,
            color: '#FF3D78', fontSize: 20, cursor: 'pointer', userSelect: 'none',
          }}
        >◀</button>
        <button
          onPointerDown={e => { e.preventDefault(); if (gsRef.current !== 'play') startGame() }}
          style={{
            flex: 2, padding: '13px 0',
            background: gstate !== 'play' ? 'rgba(255,61,120,0.12)' : 'transparent',
            border: 'none',
            color: gstate !== 'play' ? '#FF3D78' : T.text3,
            fontSize: gstate !== 'play' ? 13 : 11, fontWeight: 800, letterSpacing: 2,
            cursor: 'pointer', userSelect: 'none', fontFamily: '"Courier New",monospace',
          }}
        >{gstate !== 'play' ? '▶ START' : '← SWIPE →'}</button>
        <button
          onPointerDown={e => { e.preventDefault(); tRightRef.current = true }}
          onPointerUp={() => tRightRef.current = false}
          onPointerLeave={() => tRightRef.current = false}
          style={{
            flex: 1, padding: '13px 0',
            background: 'rgba(255,61,120,0.05)', border: 'none', borderLeft: `1px solid ${T.border}`,
            color: '#FF3D78', fontSize: 20, cursor: 'pointer', userSelect: 'none',
          }}
        >▶</button>
      </div>

      {/* ── 종료 확인 ────────────────────────────────────── */}
      {showExit && (
        <div onClick={cancelExit} style={{
          position: 'absolute', inset: 0, zIndex: 800,
          background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(6px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: T.surface, border: `1px solid ${T.border2}`,
            borderRadius: 20, padding: '28px 28px 22px',
            textAlign: 'center', width: 260,
          }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>🚀</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: T.text, marginBottom: 8 }}>게임 종료</div>
            <div style={{ fontSize: 13, color: T.text2, marginBottom: 22, lineHeight: 1.6 }}>
              게임을 종료하시겠어요?<br />진행 중인 게임이 사라집니다.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={cancelExit} style={{
                flex: 1, padding: '12px', borderRadius: 12,
                border: `1px solid ${T.border2}`, background: T.surface2,
                color: T.text2, fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
              }}>취소</button>
              <button onClick={confirmExit} style={{
                flex: 1, padding: '12px', borderRadius: 12, border: 'none',
                background: T.gradient, color: '#fff', fontWeight: 700, fontSize: 14,
                cursor: 'pointer', fontFamily: 'inherit',
                boxShadow: '0 4px 14px rgba(255,61,120,0.3)',
              }}>종료</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
