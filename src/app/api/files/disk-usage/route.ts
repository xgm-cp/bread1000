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

  // storage.objects 에서 모든 파일의 size 합산
  const { data, error } = await supabase
    .schema('storage')
    .from('objects')
    .select('metadata')
    .eq('bucket_id', 'member-files')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const totalBytes = (data ?? []).reduce((sum, obj) => {
    const size = (obj.metadata as { size?: number } | null)?.size ?? 0
    return sum + size
  }, 0)

  const percent = ((totalBytes / TOTAL_BYTES) * 100).toFixed(4)

  return NextResponse.json({ totalBytes, percent })
}
