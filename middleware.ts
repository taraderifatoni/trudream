import { NextResponse, type NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  // Check for our custom auth cookie
  const hasToken = req.cookies.has('sb-access-token')
  const { pathname } = req.nextUrl

  // Protected routes
  if ((pathname.startsWith('/playground') || pathname.startsWith('/settings')) && !hasToken) {
    const redirectUrl = new URL('/auth', req.url)
    redirectUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // If logged in and visiting /auth, redirect to playground
  if (pathname.startsWith('/auth') && hasToken) {
    return NextResponse.redirect(new URL('/playground', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/playground', '/settings', '/auth'],
}
