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

  const supabase = getServiceSupabase()

  const { data, error } = await supabase.rpc('verify_login', {
    p_아이디: 아이디,
    p_패스워드: 패스워드,
  })

  if (error || !data || data.length === 0) {
    return NextResponse.json({ error: '아이디 또는 패스워드가 올바르지 않습니다.' }, { status: 401 })
  }

  const row = data[0] as { 아이디: string; 이름: string; 사용여부: string; role: number }

  if (row.사용여부 === 'P') {
    return NextResponse.json({ error: '가입 승인 대기 중입니다. 관리자 승인 후 로그인할 수 있어요.' }, { status: 403 })
  }
  if (row.사용여부 === 'N') {
    return NextResponse.json({ error: '사용이 중지된 계정입니다. 관리자에게 문의하세요.' }, { status: 403 })
  }

  return NextResponse.json({ 아이디: row.아이디, 이름: row.이름, role: row.role })
}
