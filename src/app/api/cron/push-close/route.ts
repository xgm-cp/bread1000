import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/push/send`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify({ title: 'bread1000', body: '9시 30분 예측 마감까지 10분 남았어요! ⏰' }),
  })
  const data = await res.json()
  return NextResponse.json(data)
}
