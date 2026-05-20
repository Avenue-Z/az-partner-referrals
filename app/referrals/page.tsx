import { auth } from '@/auth'
import { signOut } from '@/auth'
import { getTier1Partners, getReferralLog } from '@/lib/hubspot/client'
import { ReferralForm } from '@/components/referral-form'
import { ReferralLog } from '@/components/referral-log'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { LogOut } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function ReferralsPage() {
  const [session, partnerResult, log] = await Promise.all([
    auth(),
    getTier1Partners(),
    getReferralLog(),
  ])

  const userName = session?.user?.name ?? session?.user?.email ?? 'Unknown'

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="border-b border-white/8 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold tracking-[0.2em] uppercase text-[#60FDFF]">Avenue Z</span>
            <Separator orientation="vertical" className="h-4 bg-white/20" />
            <span className="text-white font-semibold text-sm">Partner Referrals</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[#8A8A8A] text-sm hidden sm:block">{session?.user?.email}</span>
            <form
              action={async () => {
                'use server'
                await signOut({ redirectTo: '/login' })
              }}
            >
              <Button
                type="submit"
                variant="ghost"
                size="sm"
                className="text-[#8A8A8A] hover:text-white hover:bg-white/8 gap-1.5"
              >
                <LogOut className="size-3.5" />
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Log a Partner Referral</h1>
          <p className="text-[#8A8A8A] mt-1 text-sm">
            Refer a lead to a Tier 1 partner and log it directly in HubSpot.
          </p>
        </div>

        <ReferralForm
          partners={partnerResult.ok ? partnerResult.partners : []}
          partnerError={partnerResult.ok ? undefined : partnerResult.error}
          submitterName={userName}
        />

        <ReferralLog entries={log} />
      </main>
    </div>
  )
}
