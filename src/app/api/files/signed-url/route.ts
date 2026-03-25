import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const path = searchParams.get('path')
  const 아이디 = searchParams.get('아이디')

  if (!path || !아이디) {
    return NextResponse.json({ error: 'path와 아이디가 필요합니다.' }, { status: 400 })
  }

  // 본인 파일 또는 관리자만 접근 가능
  const supabase = getServiceSupabase()

  const { data: member } = await supabase
    .from('회원기본')
    .select('role')
    .eq('아이디', 아이디)
    .single()

  const isAdmin = (member as { role: number } | null)?.role === 1
  const isOwner = path.startsWith(`${아이디}/`)

  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
  }

  const { data, error } = await supabase.storage
    .from('member-files')
    .createSignedUrl(path, 60) // 60초 유효

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? '서명 URL 생성 실패' }, { status: 500 })
  }

  return NextResponse.json({ url: data.signedUrl })
}
