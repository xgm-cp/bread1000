import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { 아이디, subscription } = await req.json()

  if (!아이디 || !subscription?.endpoint) {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 })
  }

  const { error } = await getSupabase()
    .from('push_subscriptions')
    .upsert(
      {
        아이디,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        is_active: true,
      },
      { onConflict: 'endpoint' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
