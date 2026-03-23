import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  const { 아이디, 패스워드 } = await req.json()

  if (!아이디 || !패스워드) {
    return NextResponse.json({ error: '아이디와 패스워드를 입력해주세요.' }, { status: 400 })
  }
  if (!/^\d{4}$/.test(패스워드)) {
    return NextResponse.json({ error: '패스워드는 4자리 숫자여야 합니다.' }, { status: 400 })
  }

  const supabase = getServiceSupabase()
  const { error } = await supabase.rpc('reset_password', { p_아이디: 아이디, p_패스워드: 패스워드 })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
