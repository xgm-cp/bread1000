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

  return NextResponse.json({ files: data ?? [] })
}
