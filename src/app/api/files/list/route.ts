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

  if (!아이디) {
    return NextResponse.json({ error: '아이디가 필요합니다.' }, { status: 400 })
  }

  const supabase = getServiceSupabase()

  const { data, error } = await supabase.storage
    .from('member-files')
    .list(아이디, { sortBy: { column: 'created_at', order: 'desc' } })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 특이사항 조회
  const paths = (data ?? []).map(f => `${아이디}/${f.name}`)
  const { data: metaRows } = await supabase
    .from('파일업로드내역')
    .select('파일경로, 특이사항, 원본파일명')
    .in('파일경로', paths)

  const metaMap: Record<string, { 특이사항: string; 원본파일명: string }> = {}
  if (metaRows) {
    for (const r of metaRows as unknown as { 파일경로: string; 특이사항: string; 원본파일명: string }[]) {
      metaMap[r.파일경로] = { 특이사항: r.특이사항, 원본파일명: r.원본파일명 }
    }
  }

  const files = (data ?? []).map(f => ({
    ...f,
    특이사항: metaMap[`${아이디}/${f.name}`]?.특이사항 ?? '',
    원본파일명: metaMap[`${아이디}/${f.name}`]?.원본파일명 ?? f.name,
  }))

  return NextResponse.json({ files })
}
