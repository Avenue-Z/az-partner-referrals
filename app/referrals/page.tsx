import { auth } from '@/auth'
import { signOut } from '@/auth'
import { getActivePartners, getReferralLog } from '@/lib/hubspot/client'
import { ReferralForm } from '@/components/referral-form'
import { ReferralLog } from '@/components/referral-log'
import { AvenueZLogo } from '@/components/layout/avenue-z-logo'
import { LogOut } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function ReferralsPage() {
  const [session, partnerResult, log] = await Promise.all([
    auth(),
    getActivePartners(),
    getReferralLog(),
  ])

  const userName = session?.user?.name ?? session?.user?.email ?? 'Unknown'

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="border-b border-white/[0.06] px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <AvenueZLogo height={20} className="text-white" />
          <div className="flex items-center gap-4">
            <span className="text-text-muted text-sm hidden sm:block">{session?.user?.email}</span>
            <form
              action={async () => {
                'use server'
                await signOut({ redirectTo: '/login' })
              }}
            >
              <button
                type="submit"
                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold text-text-muted transition-colors hover:bg-white/[0.04] hover:text-white"
              >
                <LogOut className="size-3.5" />
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-text-muted mb-2">Avenue Z</p>
          <h1 className="text-4xl font-extrabold uppercase text-white">Partner Referrals</h1>
          <div className="divider-full mt-4 mb-5" />
          <ul className="space-y-1.5 text-sm text-text-muted">
            <li className="flex items-start gap-2">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-[#8A8A8A]" />
              Use the form below to attribute a contact to a Partner record in HubSpot.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-[#8A8A8A]" />
              This will log the Contact record to the Partner object for tracking.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-[#8A8A8A]" />
              You will still need to submit the Partner&apos;s referral form or reach out to them directly.
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-1.5 size-1 shrink-0 rounded-full bg-[#8A8A8A]" />
              All stakeholders will receive an email notification upon submission.
            </li>
          </ul>
        </div>

        <ReferralForm
          partners={partnerResult.ok ? partnerResult.partners.map((p) => ({
            id: p.id,
            name: p.name,
            companyType: p.companyType,
          })) : []}
          partnerError={partnerResult.ok ? undefined : partnerResult.error}
          submitterName={userName}
        />

        <ReferralLog entries={log} />
      </main>
    </div>
  )
}
