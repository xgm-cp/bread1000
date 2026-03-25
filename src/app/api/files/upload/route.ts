import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const 아이디 = formData.get('아이디') as string | null

  if (!file || !아이디) {
    return NextResponse.json({ error: '파일과 아이디가 필요합니다.' }, { status: 400 })
  }

  const supabase = getServiceSupabase()

  // 정직원 여부 확인
  const { data: member } = await supabase
    .from('회원기본')
    .select('정직원여부')
    .eq('아이디', 아이디)
    .single()

  if (!member || (member as { 정직원여부: string }).정직원여부 !== 'Y') {
    return NextResponse.json({ error: '파일 업로드 권한이 없습니다.' }, { status: 403 })
  }

  const ext = file.name.split('.').pop()
  const fileName = `${아이디}/${Date.now()}_${file.name}`
  const arrayBuffer = await file.arrayBuffer()

  const { error } = await supabase.storage
    .from('member-files')
    .upload(fileName, arrayBuffer, {
      contentType: file.type,
      upsert: false,
    })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ path: fileName })
}
