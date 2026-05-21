import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'

const isDev = process.env.NODE_ENV === 'development'

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
    // ⚠️ Dev-only bypass — never active in production
    Credentials({
      id: 'dev-bypass',
      name: 'Dev Bypass',
      credentials: {},
      authorize() {
        if (!isDev) return null
        return { id: 'dev', name: 'Dev User', email: 'dev@avenuez.com' }
      },
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      return user.email?.endsWith('@avenuez.com') ?? false
    },
  },
  pages: {
    signIn: '/login',
    error: '/unauthorized',
  },
})
