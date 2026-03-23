import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  const { 아이디, 이름, 패스워드 } = await req.json()

  if (!아이디 || !이름 || !패스워드) {
    return NextResponse.json({ error: '모든 항목을 입력해주세요.' }, { status: 400 })
  }

  const supabase = getServiceSupabase()

  const { error } = await supabase.rpc('signup_user', {
    p_아이디: 아이디,
    p_이름: 이름,
    p_패스워드: 패스워드,
  })

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: '이미 사용 중인 아이디입니다.' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
