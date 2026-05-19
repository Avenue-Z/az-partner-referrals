import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { logReferral } from '@/lib/hubspot/client'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const {
    firstName, lastName, email,
    companyName, companyDomain,
    partnerId, partnerName,
    paidReferral, notes,
  } = body as Record<string, string>

  if (!firstName || !lastName || !email || !companyName || !partnerId || !partnerName || !paidReferral) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  try {
    await logReferral({
      firstName,
      lastName,
      email,
      companyName,
      companyDomain: companyDomain || undefined,
      partnerId,
      partnerName,
      paidReferral: paidReferral as 'Yes' | 'No',
      notes: notes || undefined,
      submitterEmail: session.user.email,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/referrals]', err)
    return NextResponse.json({ error: 'Failed to log referral' }, { status: 500 })
  }
}
