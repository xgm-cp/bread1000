import { NextResponse } from 'next/server'

const BASE_URL = 'https://openapivts.koreainvestment.com:29443'  

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

// 토큰 메모리 캐시 (서버 재시작 전까지 재사용)
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
  // 만료 1분 전에 재발급하도록 설정
  tokenExpireAt = Date.now() + (data.expires_in - 60) * 1000
  return cachedToken!
}

// 목업 5일 종가 (날짜 오름차순)
const MOCK_DAILY = [
  { date: '20250311', close: '2591.30' },
  { date: '20250312', close: '2608.70' },
  { date: '20250313', close: '2625.10' },
  { date: '20250314', close: '2638.45' },
  { date: '20250317', close: '2650.50' },
]

export async function GET() {
  const appKey = process.env.KIS_APP_KEY
  const appSecret = process.env.KIS_APP_SECRET

  if (!appKey || !appSecret) {
    return NextResponse.json({
      bstp_nmix_prpr: '2650.50',
      bstp_nmix_prdy_vrss: '12.30',
      prdy_vrss_sign: '2',
      bstp_nmix_prdy_ctrt: '0.47',
      prdy_clpr: '2638.20',
      daily: MOCK_DAILY,
      mock: true,
    })
  }

  try {
    const accessToken = await getAccessToken(appKey, appSecret)
    const today = toDateStr(new Date())
    const past = toDateStr(new Date(Date.now() - 14 * 24 * 60 * 60 * 1000))

    const headers = {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
      appkey: appKey,
      appsecret: appSecret,
    }

    const [priceRes, dailyRes] = await Promise.all([
      fetch(
        `${BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-index-price` +
        `?FID_COND_MRKT_DIV_CODE=U&FID_INPUT_ISCD=0001`,
        { headers: { ...headers, tr_id: 'FHPUP02100000' }, cache: 'no-store' }
      ),
      fetch(
        `${BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-index-daily-price` +
        `?FID_COND_MRKT_DIV_CODE=U&FID_INPUT_ISCD=0001` +
        `&FID_INPUT_DATE_1=${today}&FID_INPUT_DATE_2=${past}&FID_PERIOD_DIV_CODE=D`,
        { headers: { ...headers, tr_id: 'FHPUP02120000' }, cache: 'no-store' }
      ),
    ])

    if (!priceRes.ok || !dailyRes.ok) {
      throw new Error(`KIS API error: ${priceRes.status} / ${dailyRes.status}`)
    }

    const priceData = await priceRes.json()
    const dailyData = await dailyRes.json()
    const output = priceData.output

    const todayStr = toDateStr(new Date())
    const daily = (dailyData.output2 as { stck_bsop_date: string; bstp_nmix_prpr: string }[])
      .filter(d => d.stck_bsop_date < todayStr)
      .slice(0, 5)
      .reverse()
      .map(d => ({ date: d.stck_bsop_date, close: d.bstp_nmix_prpr }))

    const prdy_clpr = (Number(output.bstp_nmix_prpr) - Number(output.bstp_nmix_prdy_vrss)).toFixed(2)

    return NextResponse.json({
      bstp_nmix_prpr: output.bstp_nmix_prpr,
      bstp_nmix_prdy_vrss: output.bstp_nmix_prdy_vrss,
      prdy_vrss_sign: output.prdy_vrss_sign,
      bstp_nmix_prdy_ctrt: output.bstp_nmix_prdy_ctrt,
      prdy_clpr,
      daily,
      mock: false,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
