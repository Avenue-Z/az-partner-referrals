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
    partnerIds, partnerNames,
    existingContactId, existingCompanyId,
    reassignContactOwner, reassignCompanyOwner,
    notes,
  } = body as Record<string, unknown>

  if (
    typeof firstName !== 'string' || !firstName ||
    typeof lastName  !== 'string' || !lastName  ||
    typeof email     !== 'string' || !email     ||
    typeof companyName !== 'string' || !companyName ||
    !Array.isArray(partnerIds)   || partnerIds.length   === 0 ||
    !Array.isArray(partnerNames) || partnerNames.length === 0
  ) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  try {
    await logReferral({
      firstName,
      lastName,
      email,
      companyName,
      companyDomain:        typeof companyDomain        === 'string'  ? companyDomain        : undefined,
      existingContactId:    typeof existingContactId    === 'string'  ? existingContactId    : undefined,
      existingCompanyId:    typeof existingCompanyId    === 'string'  ? existingCompanyId    : undefined,
      reassignContactOwner: reassignContactOwner === true,
      reassignCompanyOwner: reassignCompanyOwner === true,
      partnerIds:   partnerIds   as string[],
      partnerNames: partnerNames as string[],
      notes: typeof notes === 'string' ? notes : undefined,
      submitterEmail: session.user.email,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/referrals]', err)
    return NextResponse.json({ error: 'Failed to log referral' }, { status: 500 })
  }
}
