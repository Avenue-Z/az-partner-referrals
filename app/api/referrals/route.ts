import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { logReferral } from '@/lib/hubspot/client'
import { sendReferralNotification } from '@/lib/email/sendReferralNotification'
import { sendSlackNotification } from '@/lib/slack/sendSlackNotification'

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
    notes, mrr, monthlyOrderVolume,
  } = body as Record<string, unknown>

  // firstName + lastName are only required when creating a new contact.
  // When an existingContactId is provided the name fields are not shown
  // and the contact may have no name stored in HubSpot — that's fine.
  const isNewContact = typeof existingContactId !== 'string'
  if (
    typeof email       !== 'string' || !email       ||
    typeof companyName !== 'string' || !companyName ||
    !Array.isArray(partnerIds)   || partnerIds.length   === 0 ||
    !Array.isArray(partnerNames) || partnerNames.length === 0 ||
    (isNewContact && (typeof firstName !== 'string' || !firstName ||
                      typeof lastName  !== 'string' || !lastName))
  ) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  try {
    const { contactId, companyId, partnerReferralLinks } = await logReferral({
      firstName:   typeof firstName   === 'string' ? firstName   : '',
      lastName:    typeof lastName    === 'string' ? lastName    : '',
      email:       email as string,
      companyName: companyName as string,
      companyDomain:        typeof companyDomain        === 'string'  ? companyDomain        : undefined,
      existingContactId:    typeof existingContactId    === 'string'  ? existingContactId    : undefined,
      existingCompanyId:    typeof existingCompanyId    === 'string'  ? existingCompanyId    : undefined,
      reassignContactOwner: reassignContactOwner === true,
      reassignCompanyOwner: reassignCompanyOwner === true,
      partnerIds:   partnerIds   as string[],
      partnerNames: partnerNames as string[],
      notes:               typeof notes               === 'string' ? notes               : undefined,
      mrr:                 typeof mrr                 === 'string' ? mrr                 : undefined,
      monthlyOrderVolume:  typeof monthlyOrderVolume  === 'string' ? monthlyOrderVolume  : undefined,
      submitterEmail: session.user.email,
    })

    const contactName = `${firstName} ${lastName}`.trim() || (email as string)
    const resolvedDomain = typeof companyDomain === 'string' ? companyDomain : undefined

    // Fire email notifications — errors are logged but never fail the request
    sendReferralNotification({
      contactId,
      companyId,
      submitterEmail: session.user.email,
      contactName,
      contactEmail: email,
      companyName,
      partnerNames: partnerNames as string[],
      notes: typeof notes === 'string' ? notes : undefined,
    }).catch((err) => console.error('[/api/referrals] email notification failed:', err))

    // Fire Slack notification — errors are logged but never fail the request
    sendSlackNotification({
      contactId,
      companyId,
      submitterEmail: session.user.email,
      contactName,
      contactEmail: email,
      companyName,
      companyDomain:        resolvedDomain,
      partnerIds:           partnerIds as string[],
      partnerNames:         partnerNames as string[],
      partnerReferralLinks,
      notes:                typeof notes               === 'string' ? notes               : undefined,
      mrr:                  typeof mrr                 === 'string' ? mrr                 : undefined,
      monthlyOrderVolume:   typeof monthlyOrderVolume  === 'string' ? monthlyOrderVolume  : undefined,
      isNewContact:         typeof existingContactId   !== 'string',
      isNewCompany:         typeof existingCompanyId   !== 'string',
    }).catch((err) => console.error('[/api/referrals] Slack notification failed:', err))

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[/api/referrals]', err)
    return NextResponse.json({ error: 'Failed to log referral' }, { status: 500 })
  }
}
