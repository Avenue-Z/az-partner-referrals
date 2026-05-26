import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { getActivePartners } from '@/lib/hubspot/client'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const partners = await getActivePartners()
    return NextResponse.json(partners)
  } catch (err) {
    console.error('[/api/partners]', err)
    return NextResponse.json({ error: 'Failed to fetch partners' }, { status: 500 })
  }
}
