import { NextResponse } from 'next/server'

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

const MOCK_DATA = [
  { ticker: '0001', name: '코스피', price: '2650.50', change: '12.30', changeRate: '0.47', sign: '2' },
  { ticker: '1001', name: '코스닥', price: '850.30', change: '5.20', changeRate: '0.61', sign: '2' },
  { ticker: '069500', name: 'KODEX 200', price: '35250', change: '150', changeRate: '0.43', sign: '2' },
]

export async function GET() {
  const appKey = process.env.KIS_APP_KEY
  const appSecret = process.env.KIS_APP_SECRET

  if (!appKey || !appSecret) {
    return NextResponse.json({ stocks: MOCK_DATA, mock: true })
  }

  try {
    const accessToken = await getAccessToken(appKey, appSecret)

    const baseHeaders = {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
      appkey: appKey,
      appsecret: appSecret,
    }

    // 지수 조회 공통 함수
    function fetchIndex(iscd: string, name: string) {
      return fetch(
        `${BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-index-price` +
        `?FID_COND_MRKT_DIV_CODE=U&FID_INPUT_ISCD=${iscd}`,
        { headers: { ...baseHeaders, tr_id: 'FHPUP02100000' }, cache: 'no-store' }
      ).then(res => res.json()).then(data => {
        const o = data.output
        return {
          ticker: iscd,
          name,
          price: o.bstp_nmix_prpr,
          change: o.bstp_nmix_prdy_vrss,
          changeRate: o.bstp_nmix_prdy_ctrt,
          sign: o.prdy_vrss_sign,
        }
      })
    }

    // KODEX 200 ETF 조회
    function fetchStock(ticker: string, name: string) {
      return fetch(
        `${BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price` +
        `?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${ticker}`,
        { headers: { ...baseHeaders, tr_id: 'FHKST01010100' }, cache: 'no-store' }
      ).then(res => res.json()).then(data => {
        const o = data.output
        return {
          ticker,
          name,
          price: o.stck_prpr,
          change: o.prdy_vrss,
          changeRate: o.prdy_ctrt,
          sign: o.prdy_vrss_sign,
        }
      })
    }

    // 순서: 코스피, 코스닥, KODEX 200
    const results = await Promise.all([
      fetchIndex('0001', '코스피'),
      fetchIndex('1001', '코스닥'),
      fetchStock('069500', 'KODEX 200'),
    ])

    return NextResponse.json({ stocks: results, mock: false })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
