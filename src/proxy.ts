import { NextRequest, NextResponse } from 'next/server'

export function proxy(req: NextRequest) {
  const session = req.cookies.get('session')?.value
  const { pathname } = req.nextUrl

  const isProtected = pathname.startsWith('/home') || pathname.startsWith('/admin')
  const isLoginPage = pathname === '/'

  if (isProtected) {
    if (!session) {
      return NextResponse.redirect(new URL('/', req.url))
    }
    try {
      JSON.parse(Buffer.from(session, 'base64').toString('utf-8'))
    } catch {
      return NextResponse.redirect(new URL('/', req.url))
    }
  }

  if (isLoginPage && session) {
    try {
      JSON.parse(Buffer.from(session, 'base64').toString('utf-8'))
      return NextResponse.redirect(new URL('/home', req.url))
    } catch {
      // 세션 파싱 실패 시 로그인 페이지 유지
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/', '/home/:path*', '/admin/:path*'],
}
