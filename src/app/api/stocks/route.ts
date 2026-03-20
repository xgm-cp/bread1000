import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

const BASE_URL = 'https://openapi.koreainvestment.com:9443'
const FALLBACK_FILE = path.join(process.cwd(), 'data', 'stocks-fallback.json')

let cachedToken: string | null = null
let tokenExpireAt = 0

type StockItem = { ticker: string; name: string; price: string; change: string; changeRate: string; sign: string }
let stockCache: { stocks: StockItem[]; at: number } | null = null
const STOCK_CACHE_TTL = 3 * 60 * 1000 // 3분
let inflight: Promise<StockItem[]> | null = null // KIS API 중복 호출 방지
let lastWrittenAt = 0 // 파일 쓰기 마지막 시각
const FILE_WRITE_TTL = 5 * 60 * 1000 // 5분

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

function readFallback(): StockItem[] {
  try {
    const content = fs.readFileSync(FALLBACK_FILE, 'utf-8')
    return JSON.parse(content)
  } catch {
    return []
  }
}

function writeFallback(updated: StockItem[]) {
  try {
    fs.mkdirSync(path.dirname(FALLBACK_FILE), { recursive: true })
    const existing = readFallback()
    const map = new Map(existing.map(s => [s.ticker, s]))
    for (const s of updated) map.set(s.ticker, s)
    fs.writeFileSync(FALLBACK_FILE, JSON.stringify([...map.values()], null, 2), 'utf-8')
  } catch {
    // 파일 쓰기 실패는 무시
  }
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

  if (stockCache && Date.now() - stockCache.at < STOCK_CACHE_TTL) {
    return NextResponse.json({ stocks: stockCache.stocks, cached: true })
  }

  let accessToken: string
  try {
    accessToken = await getAccessToken(appKey, appSecret)
  } catch (e) {
    // 토큰 발급 실패 → 파일 폴백
    const fallback = readFallback()
    if (fallback.length > 0) {
      return NextResponse.json({ stocks: fallback, fallback: true })
    }
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }

  // 진행 중인 KIS API 요청이 있으면 동일 Promise 공유 (중복 호출 방지)
  if (!inflight) {
    const baseHeaders = {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
      appkey: appKey,
      appsecret: appSecret,
    }

    async function fetchIndex(iscd: string, name: string): Promise<StockItem> {
      const res = await fetch(
        `${BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-index-price` +
        `?FID_COND_MRKT_DIV_CODE=U&FID_INPUT_ISCD=${iscd}`,
        { headers: { ...baseHeaders, tr_id: 'FHPUP02100000' }, cache: 'no-store' }
      )
      const data = await res.json()
      const o = data.output
      return {
        ticker: iscd,
        name,
        price: o.bstp_nmix_prpr,
        change: o.bstp_nmix_prdy_vrss,
        changeRate: o.bstp_nmix_prdy_ctrt,
        sign: o.prdy_vrss_sign,
      }
    }

    async function fetchStock(ticker: string, name: string): Promise<StockItem> {
      const res = await fetch(
        `${BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price` +
        `?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${ticker}`,
        { headers: { ...baseHeaders, tr_id: 'FHKST01010100' }, cache: 'no-store' }
      )
      const data = await res.json()
      const o = data.output
      return {
        ticker,
        name,
        price: o.stck_prpr,
        change: o.prdy_vrss,
        changeRate: o.prdy_ctrt,
        sign: o.prdy_vrss_sign,
      }
    }

    inflight = Promise.allSettled([
      fetchIndex('0001', '코스피'),
      fetchIndex('1001', '코스닥'),
      fetchStock('069500', 'KODEX 200'),
    ]).then(([kospiResult, kosdaqResult, kodexResult]) => {
      const fallback = readFallback()
      const fallbackMap = new Map(fallback.map(s => [s.ticker, s]))

      const specs: { result: PromiseSettledResult<StockItem>; ticker: string }[] = [
        { result: kospiResult, ticker: '0001' },
        { result: kosdaqResult, ticker: '1001' },
        { result: kodexResult, ticker: '069500' },
      ]

      const stocks: StockItem[] = []
      const succeeded: StockItem[] = []

      for (const { result, ticker } of specs) {
        if (result.status === 'fulfilled') {
          stocks.push(result.value)
          succeeded.push(result.value)
        } else if (fallbackMap.has(ticker)) {
          stocks.push(fallbackMap.get(ticker)!)
        }
      }

      if (succeeded.length > 0 && Date.now() - lastWrittenAt >= FILE_WRITE_TTL) {
        writeFallback(succeeded)
        lastWrittenAt = Date.now()
      }
      if (stocks.length > 0) stockCache = { stocks, at: Date.now() }

      return stocks
    }).finally(() => {
      inflight = null
    })
  }

  const stocks = await inflight

  if (stocks.length === 0) {
    return NextResponse.json({ error: '모든 종목 조회 실패' }, { status: 500 })
  }

  return NextResponse.json({ stocks, partial: stocks.length < 3 })
}
