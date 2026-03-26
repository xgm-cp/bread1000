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
  const 아이디 = searchParams.get('아이디')
  const filename = searchParams.get('filename')

  if (!아이디 || !filename) {
    return NextResponse.json({ error: '아이디와 파일명이 필요합니다.' }, { status: 400 })
  }

  const supabase = getServiceSupabase()

  // 정직원 여부 확인
  const { data: member } = await supabase
    .from('회원기본')
    .select('정직원여부')
    .eq('아이디', 아이디)
    .single()

  if (!member || (member as unknown as { 정직원여부: string }).정직원여부 !== 'Y') {
    return NextResponse.json({ error: '파일 업로드 권한이 없습니다.' }, { status: 403 })
  }

  // 한글 파일명 → ASCII safe path (확장자만 유지)
  const ext = filename.includes('.') ? filename.split('.').pop() : ''
  const safeName = ext ? `${Date.now()}.${ext}` : `${Date.now()}`
  const path = `${아이디}/${safeName}`

  const { data, error } = await supabase.storage
    .from('member-files')
    .createSignedUploadUrl(path)

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? '업로드 URL 생성 실패' }, { status: 500 })
  }

  return NextResponse.json({ signedUrl: data.signedUrl, token: data.token, path, 원본파일명: filename })
}
