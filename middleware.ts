import { NextResponse, type NextRequest } from 'next/server'

export function middleware(req: NextRequest) {
  // sb-user is set with 30-day expiry (just stores email, no security risk).
  // sb-access-token only lasts 1 hour — using it as the gate caused users to be
  // kicked out every hour even when their session was still valid.
  const loggedIn = req.cookies.has('sb-user')
  const { pathname } = req.nextUrl

  // Protected routes
  if ((pathname.startsWith('/playground') || pathname.startsWith('/settings') || pathname.startsWith('/admin')) && !loggedIn) {
    const redirectUrl = new URL('/auth', req.url)
    redirectUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(redirectUrl)
  }

  // If logged in and visiting /auth, redirect to playground
  if (pathname.startsWith('/auth') && loggedIn) {
    return NextResponse.redirect(new URL('/playground', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/playground', '/settings', '/admin', '/auth'],
}
