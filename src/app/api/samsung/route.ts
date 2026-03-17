import { NextResponse } from 'next/server'

const BASE_URL = 'https://openapi.koreainvestment.com:9443'

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10).replace(/-/g, '')
}

let cachedToken: string | null = null
let tokenExpireAt = 0

async function getAccessToken(appKey: string, appSecret: string): Promise<string> {
  if (cachedToken && Date.now() < tokenExpireAt) return cachedToken
  const res = await fetch(`${BASE_URL}/oauth2/tokenP`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ grant_type: 'client_credentials', appkey: appKey, appsecret: appSecret }),
  })
  if (!res.ok) throw new Error(`토큰 발급 실패: ${res.status}`)
  const data = await res.json()
  cachedToken = data.access_token
  tokenExpireAt = Date.now() + (data.expires_in - 60) * 1000
  return cachedToken!
}

const MOCK_DAILY = [
  { date: '20250311', close: '72400' },
  { date: '20250312', close: '73200' },
  { date: '20250313', close: '73800' },
  { date: '20250314', close: '74200' },
  { date: '20250317', close: '74800' },
]

export async function GET() {
  const appKey = process.env.KIS_APP_KEY
  const appSecret = process.env.KIS_APP_SECRET

  if (!appKey || !appSecret) {
    return NextResponse.json({
      stck_prpr: '74800',
      prdy_vrss: '920',
      prdy_vrss_sign: '2',
      prdy_ctrt: '1.24',
      prdy_clpr: '73880',
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
      fetch(`${BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=005930`,
        { headers: { ...headers, tr_id: 'FHKST01010100' }, cache: 'no-store' }),
      fetch(`${BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=005930&FID_INPUT_DATE_1=${past}&FID_INPUT_DATE_2=${today}&FID_PERIOD_DIV_CODE=D&FID_ORG_ADJ_PRC=0`,
        { headers: { ...headers, tr_id: 'FHKST03010100' }, cache: 'no-store' }),
    ])

    if (!priceRes.ok || !dailyRes.ok) throw new Error('KIS API error')

    const priceData = await priceRes.json()
    const dailyData = await dailyRes.json()
    const output = priceData.output

    const todayStr = toDateStr(new Date())
    const daily = (dailyData.output2 as { stck_bsop_date: string; stck_clpr: string }[])
      .filter(d => d.stck_bsop_date < todayStr)
      .slice(0, 5)
      .reverse()
      .map(d => ({ date: d.stck_bsop_date, close: d.stck_clpr }))

    return NextResponse.json({
      stck_prpr: output.stck_prpr,
      prdy_vrss: output.prdy_vrss,
      prdy_vrss_sign: output.prdy_vrss_sign,
      prdy_ctrt: output.prdy_ctrt,
      prdy_clpr: output.prdy_clpr,
      daily,
      mock: false,
    })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
