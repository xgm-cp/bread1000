import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  addPlayer,
  bet,
  checkOrCall,
  createEmptyState,
  fold,
  isExpired,
  normalizeState,
  removePlayer,
  resetRoom,
  selectUpcard,
  startNewMatch,
  startNextHand,
  startSevenPoker,
} from '@/lib/poker/engine'
import { maskState } from '@/lib/poker/maskState'
import type { PokerAction, PokerState } from '@/lib/poker/types'

const ROOM_CODES = ['1001', '1002', '1003', '1004']

type PokerRoomRow = {
  room_code: string
  state_json: unknown
  version: number
  updated_at: string | null
  expires_at: string | null
}

type SessionUser = {
  role?: number
  [key: string]: unknown
}

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function getSessionUser(req: NextRequest) {
  const session = req.cookies.get('session')?.value
  if (!session) return null
  try {
    return JSON.parse(Buffer.from(session, 'base64').toString('utf-8')) as SessionUser
  } catch {
    return null
  }
}

function getUserIdentity(user: SessionUser | null) {
  const id = String(user?.['아이디'] ?? user?.id ?? user?.email ?? '')
  const name = String(user?.['이름'] ?? user?.name ?? id)
  if (!id) return null
  return { id, name: name || id }
}

function ok(state: PokerState, viewerId: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ state: maskState(state, viewerId), ...extra })
}

export async function POST(req: NextRequest) {
  const identity = getUserIdentity(getSessionUser(req))
  if (!identity) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  let body: {
    action?: PokerAction
    roomCode?: string
    cardIndex?: number
    amount?: number
  }

  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '요청 형식이 올바르지 않습니다.' }, { status: 400 })
  }

  const action = body.action
  if (!action) return NextResponse.json({ error: 'action이 필요합니다.' }, { status: 400 })

  try {
    const supabase = getSupabase()

    if (action === 'create') {
      const { data, error } = await supabase
        .from('poker_rooms')
        .select('room_code, state_json, version, updated_at, expires_at')
        .in('room_code', ROOM_CODES)
        .order('room_code', { ascending: true })

      if (error) throw new Error(error.message)

      for (const row of (data ?? []) as PokerRoomRow[]) {
        const current = isExpired(row.updated_at, row.expires_at)
          ? createEmptyState(row.room_code)
          : normalizeState(row.room_code, row.state_json)

        if (current.players.length > 0 && current.street !== 'showdown') continue

        const next = addPlayer(createEmptyState(row.room_code), identity)
        const saved = await saveRoom(supabase, row, next)
        if (saved) return ok(next, identity.id, { roomCode: row.room_code })
      }

      return NextResponse.json({ error: '현재 사용 가능한 방이 없습니다. 잠시 후 다시 시도해주세요.' }, { status: 409 })
    }

    const roomCode = String(body.roomCode ?? '')
    if (!ROOM_CODES.includes(roomCode)) {
      return NextResponse.json({ error: '방 코드를 확인해주세요.' }, { status: 400 })
    }

    const row = await getRoom(supabase, roomCode)
    const current = isExpired(row.updated_at, row.expires_at)
      ? createEmptyState(roomCode)
      : normalizeState(roomCode, row.state_json)

    if (action === 'state') return ok(current, identity.id, { roomCode })

    let next = current
    if (action === 'join') next = addPlayer(current, identity)
    if (action === 'start') next = startSevenPoker(current, identity.id)
    if (action === 'selectUpcard') next = selectUpcard(current, identity.id, Number(body.cardIndex ?? -1))
    if (action === 'check') next = checkOrCall(current, identity.id)
    if (action === 'bet') next = bet(current, identity.id, Number(body.amount ?? 1))
    if (action === 'fold') next = fold(current, identity.id)
    if (action === 'leave') next = removePlayer(current, identity.id)
    if (action === 'nextHand') next = startNextHand(current, identity.id)
    if (action === 'newMatch') next = startNewMatch(current, identity.id)
    if (action === 'reset') {
      if (current.hostId && current.hostId !== identity.id) throw new Error('방장만 리셋할 수 있습니다.')
      next = resetRoom(roomCode)
    }

    const saved = await saveRoom(supabase, row, next)
    if (!saved) {
      return NextResponse.json({ error: '다른 요청이 먼저 처리되었습니다. 새로고침해주세요.', conflict: true }, { status: 409 })
    }

    return ok(next, identity.id, { roomCode })
  } catch (error) {
    const message = error instanceof Error ? error.message : '처리 중 오류가 발생했습니다.'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

async function getRoom(supabase: ReturnType<typeof getSupabase>, roomCode: string) {
  const { data, error } = await supabase
    .from('poker_rooms')
    .select('room_code, state_json, version, updated_at, expires_at')
    .eq('room_code', roomCode)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!data) throw new Error('방을 찾을 수 없습니다.')
  return data as PokerRoomRow
}

async function saveRoom(supabase: ReturnType<typeof getSupabase>, row: PokerRoomRow, state: PokerState) {
  const { data, error } = await supabase
    .from('poker_rooms')
    .update({
      state_json: state,
      version: row.version + 1,
      expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    })
    .eq('room_code', row.room_code)
    .eq('version', row.version)
    .select('room_code')
    .maybeSingle()

  if (error) throw new Error(error.message)
  return Boolean(data)
}
