import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { Agent, fetch as undiciFetch } from 'undici'
import { getSupabase } from '@/lib/supabase'

const BASE_URL = 'https://openapivts.koreainvestment.com:29443'
// 모의서버 SSL 인증서 불일치 우회 (KIS API 호출 전용)
const kisAgent = new Agent({ connect: { rejectUnauthorized: false } })
const FALLBACK_FILE = path.join(process.cwd(), 'data', 'stocks-fallback.json')

let cachedToken: string | null = null
let tokenExpireAt = 0

type StockItem = { ticker: string; name: string; price: string; change: string; changeRate: string; sign: string }
let stockCache: StockItem[] | null = null // KIS API 실패 시 서버 메모리 폴백용
let inflight: Promise<{ stocks: StockItem[]; kospiFromSupabase: boolean }> | null = null // KIS API 중복 호출 방지
let lastWrittenAt = 0 // 파일 쓰기 마지막 시각
const FILE_WRITE_TTL = 1 * 60 * 1000 // 1분

async function getAccessToken(appKey: string, appSecret: string): Promise<string> {
  if (cachedToken && Date.now() < tokenExpireAt) return cachedToken

  const res = await undiciFetch(`${BASE_URL}/oauth2/tokenP`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      appkey: appKey,
      appsecret: appSecret,
    }),
    dispatcher: kisAgent,
    signal: AbortSignal.timeout(3000),
  })

  if (!res.ok) throw new Error(`토큰 발급 실패: ${res.status}`)

  const data = await res.json() as { access_token: string; expires_in: number }
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

  let accessToken: string
  try {
    accessToken = await getAccessToken(appKey, appSecret)
  } catch (e) {
    // 토큰 발급 실패 → 서버 메모리 캐시 → 파일 폴백 순서
    if (stockCache && stockCache.length > 0) {
      return NextResponse.json({ stocks: stockCache, cached: true })
    }
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

    function makeAbortSignal(ms: number) {
      return AbortSignal.timeout(ms)
    }

    async function fetchIndex(iscd: string, name: string): Promise<StockItem> {
      const res = await undiciFetch(
        `${BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-index-price` +
        `?FID_COND_MRKT_DIV_CODE=U&FID_INPUT_ISCD=${iscd}`,
        { headers: { ...baseHeaders, tr_id: 'FHPUP02100000' }, dispatcher: kisAgent, signal: makeAbortSignal(3000) }
      )
      const data = await res.json() as { output?: Record<string, string>; msg1?: string }
      const o = data.output
      if (!res.ok || !o?.bstp_nmix_prpr) throw new Error(`index ${iscd} 조회 실패: ${data.msg1 ?? res.status}`)
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
      const res = await undiciFetch(
        `${BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-price` +
        `?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${ticker}`,
        { headers: { ...baseHeaders, tr_id: 'FHKST01010100' }, dispatcher: kisAgent, signal: makeAbortSignal(3000) }
      )
      const data = await res.json() as { output?: Record<string, string>; msg1?: string }
      const o = data.output
      if (!res.ok || !o?.stck_prpr) throw new Error(`stock ${ticker} 조회 실패: ${data.msg1 ?? res.status}`)
      return {
        ticker,
        name,
        price: o.stck_prpr,
        change: o.prdy_vrss,
        changeRate: o.prdy_ctrt,
        sign: o.prdy_vrss_sign,
      }
    }

    inflight = Promise.all([
      Promise.allSettled([fetchIndex('0001', '코스피')]),
      Promise.allSettled([fetchIndex('1001', '코스닥'), fetchStock('069500', 'KODEX 200')]),
    ]).then(async ([[kospiResult], [kosdaqResult, kodexResult]]) => {
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
        } else if (ticker === '0001') {
          // 코스피 KIS API 실패 → Supabase 종가관리내역 폴백 (가장 최근 데이터)
          try {
            const { data } = await getSupabase()
              .from('종가관리내역')
              .select('종가')
              .eq('종목코드', '0001')
              .order('기준일자', { ascending: false })
              .limit(2)
            const rows = data as unknown as { 종가: number }[] | null
            if (rows && rows.length > 0) {
              const latest = rows[0]
              const prev = rows[1]
              const sign = prev
                ? (latest.종가 > prev.종가 ? '2' : latest.종가 < prev.종가 ? '5' : '3')
                : '3'
              const diff = prev ? latest.종가 - prev.종가 : 0
              stocks.push({ ticker: '0001', name: '코스피', price: String(latest.종가), change: String(diff), changeRate: '0.00', sign })
            }
          } catch { /* Supabase 폴백도 실패하면 무시 */ }
        } else if (fallbackMap.has(ticker)) {
          stocks.push(fallbackMap.get(ticker)!)
        }
      }

      if (succeeded.length > 0 && Date.now() - lastWrittenAt >= FILE_WRITE_TTL) {
        writeFallback(succeeded)
        lastWrittenAt = Date.now()
      }
      if (stocks.length > 0) stockCache = stocks // 성공 시 서버 메모리에 저장
      const kospiFromSupabase = stocks.some(s => s.ticker === '0001') && !succeeded.find(r => r.ticker === '0001')

      return { stocks, kospiFromSupabase }
    }).finally(() => {
      inflight = null
    })
  }

  const { stocks, kospiFromSupabase } = await inflight

  if (stocks.length === 0) {
    // KIS API 전부 실패 → 서버 메모리 캐시 → 파일 폴백 순서
    if (stockCache && stockCache.length > 0) {
      return NextResponse.json({ stocks: stockCache, cached: true })
    }
    const fallback = readFallback()
    if (fallback.length > 0) {
      return NextResponse.json({ stocks: fallback, fallback: true })
    }
    return NextResponse.json({ error: '모든 종목 조회 실패' }, { status: 500 })
  }

  return NextResponse.json({ stocks, partial: stocks.length < 3, kospiFromSupabase })
}
