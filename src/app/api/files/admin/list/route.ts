import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(req: NextRequest) {
  const supabase = getServiceSupabase()

  // 버킷 루트의 폴더(회원ID별) 목록 조회
  const { data: folders, error: folderErr } = await supabase.storage
    .from('member-files')
    .list('', { sortBy: { column: 'name', order: 'asc' } })

  if (folderErr) {
    return NextResponse.json({ error: folderErr.message }, { status: 500 })
  }

  if (!folders || folders.length === 0) {
    return NextResponse.json({ files: [] })
  }

  // 회원명 조회
  const memberIds = folders.map(f => f.name)
  const { data: members } = await supabase
    .from('회원기본')
    .select('아이디, 이름')
    .in('아이디', memberIds)

  const memberMap: Record<string, string> = {}
  if (members) {
    for (const m of members as unknown as { 아이디: string; 이름: string }[]) {
      memberMap[m.아이디] = m.이름
    }
  }

  // 각 폴더별 파일 목록 조회
  const allFiles = []
  for (const folder of folders) {
    const { data: files } = await supabase.storage
      .from('member-files')
      .list(folder.name, { sortBy: { column: 'created_at', order: 'desc' } })

    if (files) {
      for (const file of files) {
        allFiles.push({
          id: file.id,
          name: file.name,
          created_at: file.created_at,
          memberId: folder.name,
          memberName: memberMap[folder.name] ?? folder.name,
        })
      }
    }
  }

  // 업로드일자 내림차순 정렬
  allFiles.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  return NextResponse.json({ files: allFiles })
}
