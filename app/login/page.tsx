import { signIn } from '@/auth'
import { AvenueZLogo } from '@/components/layout/avenue-z-logo'

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-glow px-4">

      {/* Card */}
      <div className="w-full max-w-sm rounded-xl border border-white/[0.06] bg-bg-surface p-8">
        <div className="mb-6 flex justify-center">
          <AvenueZLogo height={22} className="text-white" />
        </div>

        <h1 className="mb-8 text-center text-xl font-extrabold text-white">
          Partner Referrals
        </h1>

        <form
          action={async () => {
            'use server'
            await signIn('google', { redirectTo: '/referrals' })
          }}
        >
          <button
            type="submit"
            className="w-full rounded-full bg-white px-6 py-3 text-sm font-bold text-black transition-opacity hover:opacity-90"
          >
            Continue with Google
          </button>
        </form>
      </div>

      <p className="text-center text-sm text-text-muted">
        Restricted to @avenuez.com accounts
      </p>
    </div>
  )
}
