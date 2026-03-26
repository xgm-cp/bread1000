import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function DELETE(req: NextRequest) {
  const { path, 아이디 } = await req.json()

  if (!path || !아이디) {
    return NextResponse.json({ error: 'path와 아이디가 필요합니다.' }, { status: 400 })
  }

  const supabase = getServiceSupabase()

  // 본인 파일이거나 관리자(role=1)만 삭제 가능
  const isOwner = path.startsWith(`${아이디}/`)
  if (!isOwner) {
    const { data: member } = await supabase.from('회원기본').select('role').eq('아이디', 아이디).single()
    if ((member as unknown as { role: number } | null)?.role !== 1) {
      return NextResponse.json({ error: '권한이 없습니다.' }, { status: 403 })
    }
  }

  const { error } = await supabase.storage
    .from('member-files')
    .remove([path])

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 메타데이터도 삭제
  await supabase.from('파일업로드내역').delete().eq('파일경로', path)

  return NextResponse.json({ ok: true })
}
