import { signIn } from '@/auth'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function LoginPage() {
  const isDev = process.env.NODE_ENV === 'development'

  return (
    <div className="min-h-screen flex items-center justify-center bg-black px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <p className="text-xs font-bold tracking-[0.2em] uppercase text-[#60FDFF]">Avenue Z</p>
          <h1 className="text-2xl font-bold text-white">Partner Referrals</h1>
        </div>

        <Card className="bg-[#272727] border-white/8">
          <CardHeader className="pb-4">
            <CardTitle className="text-white text-lg">Sign in</CardTitle>
            <CardDescription className="text-[#8A8A8A]">
              Use your Avenue Z Google account to continue.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <form
              action={async () => {
                'use server'
                await signIn('google', { redirectTo: '/referrals' })
              }}
            >
              <Button
                type="submit"
                className="w-full bg-[#60FDFF] text-black font-bold hover:bg-[#60FDFF]/90"
              >
                Continue with Google
              </Button>
            </form>

            {isDev && (
              <form
                action={async () => {
                  'use server'
                  await signIn('dev-bypass', { redirectTo: '/referrals' })
                }}
              >
                <Button
                  type="submit"
                  variant="outline"
                  className="w-full border-dashed border-white/20 text-[#8A8A8A] hover:text-white hover:border-white/40 hover:bg-transparent text-xs"
                >
                  Dev bypass (local only)
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
