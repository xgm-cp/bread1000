import { NextRequest, NextResponse } from 'next/server'
import webpush from 'web-push'
import { getSupabase } from '@/lib/supabase'

const CRON_SECRET = process.env.CRON_SECRET

export async function POST(req: NextRequest) {
  webpush.setVapidDetails(
    'mailto:admin@bread1000.com',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )
  // Cron 요청 인증
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { title, body } = await req.json()

  const { data: subs, error } = await getSupabase()
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('is_active', true) as unknown as {
      data: { endpoint: string; p256dh: string; auth: string }[] | null
      error: unknown
    }

  if (error || !subs) {
    return NextResponse.json({ error: '구독 조회 실패' }, { status: 500 })
  }

  const payload = JSON.stringify({ title, body })
  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      ).catch(async (err) => {
        // 만료된 구독 비활성화
        if (err.statusCode === 410 || err.statusCode === 404) {
          await getSupabase()
            .from('push_subscriptions')
            .update({ is_active: false })
            .eq('endpoint', sub.endpoint)
        }
        throw err
      })
    )
  )

  const succeeded = results.filter((r) => r.status === 'fulfilled').length
  return NextResponse.json({ ok: true, sent: succeeded, total: subs.length })
}
