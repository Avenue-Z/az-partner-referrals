import { auth } from '@/auth'

export default auth((req) => {
  const { pathname } = req.nextUrl
  const session = req.auth

  if (!session && pathname !== '/login' && pathname !== '/unauthorized') {
    return Response.redirect(new URL('/login', req.url))
  }
})

export const config = {
  matcher: [
    '/referrals/:path*',
    '/api/referrals/:path*',
    '/api/partners/:path*',
    '/api/lookup/:path*',
  ],
}
