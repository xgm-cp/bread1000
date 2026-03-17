import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/push/send`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.CRON_SECRET}`,
    },
    body: JSON.stringify({ title: '빵천', body: '예측 결과입니다.' }),
  })
  const data = await res.json()
  return NextResponse.json(data)
}
