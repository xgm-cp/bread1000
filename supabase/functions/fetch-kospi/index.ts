import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const KIS_BASE_URL = 'https://openapivts.koreainvestment.com:29443'

let cachedToken: string | null = null
let tokenExpireAt = 0

async function getAccessToken(appKey: string, appSecret: string): Promise<string> {
  if (cachedToken && Date.now() < tokenExpireAt) return cachedToken

  const res = await fetch(`${KIS_BASE_URL}/oauth2/tokenP`, {
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

function getKstNow() {
  return new Date(Date.now() + 9 * 60 * 60 * 1000)
}

function toKstISO(d: Date) {
  return new Date(d.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 23)
}

Deno.serve(async () => {
  const kstNow = getKstNow()
  const dayOfWeek = kstNow.getUTCDay() // 0=일, 6=토
  const timeInMinutes = kstNow.getUTCHours() * 60 + kstNow.getUTCMinutes()

  // 주말 스킵
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return new Response(JSON.stringify({ skipped: true, reason: '주말' }), { status: 200 })
  }

  // 장 시간 외 스킵 (KST 08:00 ~ 16:00)
  if (timeInMinutes < 8 * 60 || timeInMinutes > 16 * 60) {
    return new Response(JSON.stringify({ skipped: true, reason: '장 시간 외' }), { status: 200 })
  }

  const appKey = Deno.env.get('KIS_APP_KEY')
  const appSecret = Deno.env.get('KIS_APP_SECRET')

  if (!appKey || !appSecret) {
    return new Response(JSON.stringify({ error: 'KIS API 키 미설정' }), { status: 500 })
  }

  try {
    const accessToken = await getAccessToken(appKey, appSecret)

    const res = await fetch(
      `${KIS_BASE_URL}/uapi/domestic-stock/v1/quotations/inquire-index-price` +
      `?FID_COND_MRKT_DIV_CODE=U&FID_INPUT_ISCD=0001`,
      {
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
          appkey: appKey,
          appsecret: appSecret,
          tr_id: 'FHPUP02100000',
        },
      }
    )

    if (!res.ok) {
      cachedToken = null
      throw new Error(`KIS API 오류: ${res.status}`)
    }

    const json = await res.json()
    const output = json.output
    const 종가 = parseFloat(output.bstp_nmix_prpr)

    if (!종가 || isNaN(종가)) {
      throw new Error('종가 파싱 실패: ' + JSON.stringify(output))
    }

    const 기준일자 = kstNow.toISOString().slice(0, 10)
    const kstISO = toKstISO(new Date())

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { error } = await supabase
      .from('종가관리내역')
      .upsert(
        {
          기준일자,
          종목코드: '0001',
          종목코드명: '코스피',
          종가,
          등록일시: kstISO,
          변경일시: kstISO,
        },
        { onConflict: '기준일자,종목코드' }
      )

    if (error) throw new Error('Supabase upsert 실패: ' + error.message)

    return new Response(
      JSON.stringify({ ok: true, 기준일자, 종가, 등록일시: kstISO, 변경일시: kstISO }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  } catch (e) {
    console.error('[fetch-kospi]', e)
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 })
  }
})
