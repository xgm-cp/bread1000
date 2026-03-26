import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const TOTAL_BYTES = 1024 * 1024 * 1024 * 1024 // 1TB

export async function GET() {
  const supabase = getServiceSupabase()

  // 버킷 루트 폴더(회원ID) 목록
  const { data: folders, error: folderErr } = await supabase.storage
    .from('member-files')
    .list('', { sortBy: { column: 'name', order: 'asc' } })

  if (folderErr) {
    return NextResponse.json({ error: folderErr.message }, { status: 500 })
  }

  let totalBytes = 0

  for (const folder of folders ?? []) {
    const { data: files } = await supabase.storage
      .from('member-files')
      .list(folder.name)

    for (const file of files ?? []) {
      const size = (file.metadata as { size?: number } | null)?.size ?? 0
      totalBytes += size
    }
  }

  const percent = ((totalBytes / TOTAL_BYTES) * 100).toFixed(4)

  return NextResponse.json({ totalBytes, percent })
}
