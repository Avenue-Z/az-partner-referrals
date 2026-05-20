'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CheckCircle, Loader2, AlertCircle } from 'lucide-react'

type Partner = { id: string; name: string }

type Props = {
  partners: Partner[]
  partnerError?: string
  submitterName: string
}

type FormState = {
  firstName: string
  lastName: string
  email: string
  companyName: string
  companyDomain: string
  partnerId: string
  paidReferral: string
  notes: string
}

const EMPTY: FormState = {
  firstName: '',
  lastName: '',
  email: '',
  companyName: '',
  companyDomain: '',
  partnerId: '',
  paidReferral: '',
  notes: '',
}

export function ReferralForm({ partners, partnerError, submitterName }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<FormState>(EMPTY)
  const [partnerSearch, setPartnerSearch] = useState('')
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const set = (field: keyof FormState) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setForm((f) => ({ ...f, [field]: e.target.value }))

  const filteredPartners = useMemo(() => {
    const q = partnerSearch.toLowerCase().trim()
    if (!q) return partners
    return partners.filter((p) => p.name.toLowerCase().includes(q))
  }, [partners, partnerSearch])

  const selectedPartner = partners.find((p) => p.id === form.partnerId)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.partnerId || !form.paidReferral) return

    setStatus('loading')
    setErrorMsg('')

    const partner = partners.find((p) => p.id === form.partnerId)

    try {
      const res = await fetch('/api/referrals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          partnerName: partner?.name ?? '',
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Something went wrong')
      }

      setStatus('success')
      setForm(EMPTY)
      setPartnerSearch('')
      router.refresh()
    } catch (err) {
      setStatus('error')
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong')
    }
  }

  return (
    <Card className="bg-[#272727] border-white/8">
      <CardHeader>
        <CardTitle className="text-white text-xl">Log a Referral</CardTitle>
        <CardDescription className="text-[#8A8A8A]">
          Submitting as <span className="text-white font-medium">{submitterName}</span>
        </CardDescription>
      </CardHeader>
      {partnerError && (
        <div className="mx-6 mb-2 flex items-start gap-2 rounded-lg border border-[#FF4444]/30 bg-[#FF4444]/8 px-4 py-3 text-sm text-[#FF4444]">
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">HubSpot connection error</p>
            <p className="mt-0.5 text-[#FF4444]/80">{partnerError}</p>
          </div>
        </div>
      )}
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Lead info */}
          <div className="space-y-3">
            <p className="text-xs font-bold tracking-[0.15em] uppercase text-[#8A8A8A]">Lead Info</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="firstName" className="text-white text-sm">First Name <span className="text-[#FF4444]">*</span></Label>
                <Input
                  id="firstName"
                  value={form.firstName}
                  onChange={set('firstName')}
                  required
                  placeholder="Jane"
                  className="bg-[#1a1a1a] border-white/8 text-white placeholder:text-[#8A8A8A] focus-visible:ring-[#60FDFF]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lastName" className="text-white text-sm">Last Name <span className="text-[#FF4444]">*</span></Label>
                <Input
                  id="lastName"
                  value={form.lastName}
                  onChange={set('lastName')}
                  required
                  placeholder="Smith"
                  className="bg-[#1a1a1a] border-white/8 text-white placeholder:text-[#8A8A8A] focus-visible:ring-[#60FDFF]"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-white text-sm">Email <span className="text-[#FF4444]">*</span></Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={set('email')}
                required
                placeholder="jane@company.com"
                className="bg-[#1a1a1a] border-white/8 text-white placeholder:text-[#8A8A8A] focus-visible:ring-[#60FDFF]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="companyName" className="text-white text-sm">Company <span className="text-[#FF4444]">*</span></Label>
                <Input
                  id="companyName"
                  value={form.companyName}
                  onChange={set('companyName')}
                  required
                  placeholder="Acme Corp"
                  className="bg-[#1a1a1a] border-white/8 text-white placeholder:text-[#8A8A8A] focus-visible:ring-[#60FDFF]"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="companyDomain" className="text-white text-sm">Website</Label>
                <Input
                  id="companyDomain"
                  value={form.companyDomain}
                  onChange={set('companyDomain')}
                  placeholder="acme.com"
                  className="bg-[#1a1a1a] border-white/8 text-white placeholder:text-[#8A8A8A] focus-visible:ring-[#60FDFF]"
                />
              </div>
            </div>
          </div>

          {/* Referral details */}
          <div className="space-y-3">
            <p className="text-xs font-bold tracking-[0.15em] uppercase text-[#8A8A8A]">Referral Details</p>

            {/* Partner search + select */}
            <div className="space-y-1.5">
              <Label className="text-white text-sm">Referred to Partner <span className="text-[#FF4444]">*</span></Label>
              <Input
                value={partnerSearch}
                onChange={(e) => {
                  setPartnerSearch(e.target.value)
                  setForm((f) => ({ ...f, partnerId: '' }))
                }}
                placeholder="Search partners..."
                className="bg-[#1a1a1a] border-white/8 text-white placeholder:text-[#8A8A8A] focus-visible:ring-[#60FDFF] mb-1.5"
              />
              <Select
                value={form.partnerId}
                onValueChange={(v) => {
                  setForm((f) => ({ ...f, partnerId: v ?? '' }))
                  const p = partners.find((x) => x.id === v)
                  if (p) setPartnerSearch(p.name)
                }}
                required
              >
                <SelectTrigger className="bg-[#1a1a1a] border-white/8 text-white focus:ring-[#60FDFF]">
                  <SelectValue placeholder={
                    selectedPartner
                      ? selectedPartner.name
                      : filteredPartners.length === 0
                        ? 'No matching partners'
                        : 'Select a partner'
                  } />
                </SelectTrigger>
                <SelectContent className="bg-[#272727] border-white/8 text-white max-h-64">
                  {filteredPartners.map((p) => (
                    <SelectItem
                      key={p.id}
                      value={p.id}
                      className="text-white focus:bg-[#1a1a1a] focus:text-white"
                    >
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-white text-sm">Referral Type <span className="text-[#FF4444]">*</span></Label>
              <Select
                value={form.paidReferral}
                onValueChange={(v) => setForm((f) => ({ ...f, paidReferral: v ?? '' }))}
                required
              >
                <SelectTrigger className="bg-[#1a1a1a] border-white/8 text-white focus:ring-[#60FDFF]">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent className="bg-[#272727] border-white/8 text-white">
                  <SelectItem value="Yes" className="text-white focus:bg-[#1a1a1a] focus:text-white">Paid Referral</SelectItem>
                  <SelectItem value="No" className="text-white focus:bg-[#1a1a1a] focus:text-white">Non-Paid Referral</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes" className="text-white text-sm">Notes</Label>
              <Textarea
                id="notes"
                value={form.notes}
                onChange={set('notes')}
                placeholder="Context about this lead or referral..."
                rows={3}
                className="bg-[#1a1a1a] border-white/8 text-white placeholder:text-[#8A8A8A] focus-visible:ring-[#60FDFF] resize-none"
              />
            </div>
          </div>

          {/* Status feedback */}
          {status === 'success' && (
            <div className="flex items-center gap-2 text-[#60FF80] text-sm">
              <CheckCircle className="size-4 shrink-0" />
              Referral logged successfully in HubSpot.
            </div>
          )}
          {status === 'error' && (
            <div className="flex items-center gap-2 text-[#FF4444] text-sm">
              <AlertCircle className="size-4 shrink-0" />
              {errorMsg}
            </div>
          )}

          <Button
            type="submit"
            disabled={status === 'loading' || !form.partnerId || !form.paidReferral}
            className="w-full bg-[#60FDFF] text-black font-bold hover:bg-[#60FDFF]/90 disabled:opacity-40"
          >
            {status === 'loading' ? (
              <><Loader2 className="size-4 mr-2 animate-spin" /> Logging Referral…</>
            ) : (
              'Log Referral'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
