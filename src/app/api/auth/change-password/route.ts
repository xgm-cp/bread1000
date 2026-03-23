import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  const { 아이디, 현재패스워드, 새패스워드 } = await req.json()

  if (!아이디 || !현재패스워드 || !새패스워드) {
    return NextResponse.json({ error: '모든 항목을 입력해주세요.' }, { status: 400 })
  }

  const supabase = getServiceSupabase()

  // 현재 비밀번호 검증
  const { data, error: verifyError } = await supabase.rpc('verify_login', {
    p_아이디: 아이디,
    p_패스워드: 현재패스워드,
  })

  if (verifyError || !data || data.length === 0) {
    return NextResponse.json({ error: '현재 비밀번호가 올바르지 않습니다.' }, { status: 401 })
  }

  // 새 비밀번호로 업데이트
  const { error } = await supabase.rpc('reset_password', {
    p_아이디: 아이디,
    p_패스워드: 새패스워드,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
