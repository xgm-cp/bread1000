import { NextRequest, NextResponse } from 'next/server'

const BASE_URL = 'https://openapi.koreainvestment.com:9443'

let cachedToken: string | null = null
let tokenExpireAt = 0

async function getAccessToken(appKey: string, appSecret: string): Promise<string> {
  if (cachedToken && Date.now() < tokenExpireAt) return cachedToken

  const res = await fetch(`${BASE_URL}/oauth2/tokenP`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      appkey: appKey,
      appsecret: appSecret,
    }),
  })

  if (!res.ok) throw new Error(`토큰 발급 실패: ${res.status}`)

  const data = await res.json()
  cachedToken = data.access_token
  tokenExpireAt = Date.now() + (data.expires_in - 60) * 1000
  return cachedToken!
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get('date') // YYYYMMDD

  if (!date) return NextResponse.json({ error: 'date 파라미터 필요' }, { status: 400 })

  // 주말이면 API 호출 없이 바로 반환
  const d = new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`)
  const day = d.getUTCDay()
  if (day === 0 || day === 6) return NextResponse.json({ isTradingDay: false })

  const appKey = process.env.KIS_APP_KEY
  const appSecret = process.env.KIS_APP_SECRET

  if (!appKey || !appSecret) {
    return NextResponse.json({ isTradingDay: true })
  }

  const MAX_RETRY = 3
  let lastError: unknown

  for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
    try {
      const accessToken = await getAccessToken(appKey, appSecret)

      const res = await fetch(
        `${BASE_URL}/uapi/domestic-stock/v1/quotations/chk-holiday?BASS_DT=${date}&CTX_AREA_NK=&CTX_AREA_FK=`,
        {
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${accessToken}`,
            appkey: appKey,
            appsecret: appSecret,
            tr_id: 'CTCA0903R',
            custtype: 'P',
          },
          cache: 'no-store',
        }
      )

      if (!res.ok) throw new Error(`API 오류: ${res.status}`)

      const data = await res.json()
      const today = data.output?.find((d: { bass_dt: string }) => d.bass_dt === date)
      const isTradingDay = today?.bzdy_yn === 'Y'

      return NextResponse.json({ isTradingDay })
    } catch (e) {
      lastError = e
      if (attempt < MAX_RETRY - 1) await new Promise(r => setTimeout(r, 1000))
    }
  }

  console.error('trading-day API 3회 실패:', lastError)
  return NextResponse.json({ isTradingDay: true })
}
