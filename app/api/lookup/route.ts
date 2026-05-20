import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { lookupContactByEmail, lookupCompany } from '@/lib/hubspot/client'

/**
 * GET /api/lookup?email=...
 *   → { contact: ContactMatch | null, company: CompanyMatch | null }
 *     (company is the contact's primary associated company, if any)
 *
 * GET /api/lookup?domain=... or ?name=...
 *   → { company: CompanyMatch | null }
 */
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const email  = searchParams.get('email')  ?? ''
  const domain = searchParams.get('domain') ?? ''
  const name   = searchParams.get('name')   ?? ''

  if (email) {
    const result = await lookupContactByEmail(email)
    return NextResponse.json(result)
  }

  if (domain || name) {
    const company = await lookupCompany({
      domain: domain || undefined,
      name:   name   || undefined,
    })
    return NextResponse.json({ company })
  }

  return NextResponse.json({ error: 'Provide email or domain/name' }, { status: 400 })
}
