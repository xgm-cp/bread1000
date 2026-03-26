import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  const { 파일경로, 아이디, 특이사항, 원본파일명 } = await req.json()

  if (!파일경로 || !아이디) {
    return NextResponse.json({ error: '파일경로와 아이디가 필요합니다.' }, { status: 400 })
  }

  const supabase = getServiceSupabase()

  const { error } = await supabase.from('파일업로드내역').upsert({
    파일경로,
    아이디,
    특이사항: 특이사항 ?? '',
    원본파일명: 원본파일명 ?? '',
    변경일시: new Date().toISOString(),
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
