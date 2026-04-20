import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  const { 게임종류, 사용자아이디, 사용자이름, 점수, 레벨 } = await req.json()

  if (!게임종류 || !사용자아이디 || !점수) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 })
  }

  const supabase = getSupabase()

  // 기존 점수보다 높을 때만 업데이트
  const { data: existing } = await supabase
    .from('게임최고점수')
    .select('점수')
    .eq('사용자아이디', 사용자아이디)
    .eq('게임종류', 게임종류)
    .maybeSingle() as { data: { 점수: number } | null; error: unknown }

  if (existing && existing.점수 >= 점수) {
    return NextResponse.json({ updated: false })
  }

  const { error } = await supabase
    .from('게임최고점수')
    .upsert(
      { 사용자아이디, 게임종류, 사용자이름, 점수, 레벨: 레벨 ?? null, updated_at: new Date().toISOString() },
      { onConflict: '사용자아이디,게임종류' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ updated: true })
}
