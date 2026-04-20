import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(req: NextRequest) {
  const game = req.nextUrl.searchParams.get('game')
  if (!game) return NextResponse.json({ error: 'game required' }, { status: 400 })

  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('게임최고점수')
    .select('사용자이름, 점수, 레벨')
    .eq('게임종류', game)
    .order('점수', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return NextResponse.json({ top: null })
  return NextResponse.json({ top: data ?? null })
}
