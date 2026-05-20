'use client'

import { useMemo, useState } from 'react'
import { Check } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { COMPANY_TYPE_LABELS, COMPANY_TYPE_ORDER } from '@/lib/hubspot/client'

export type PickerPartner = {
  id: string
  name: string
  companyType: string | null
}

type Props = {
  partners: PickerPartner[]
  selected: string[]       // array of partner IDs
  onChange: (ids: string[]) => void
}

export function PartnerPicker({ partners, selected, onChange }: Props) {
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return partners
    return partners.filter((p) => p.name.toLowerCase().includes(q))
  }, [partners, search])

  // Group by company_type, preserving display order
  const groups = useMemo(() => {
    const map = new Map<string, PickerPartner[]>()

    // pre-seed in the desired order
    for (const key of COMPANY_TYPE_ORDER) {
      map.set(key, [])
    }
    map.set('__other__', [])

    for (const p of filtered) {
      const key = p.companyType ?? '__other__'
      if (map.has(key)) {
        map.get(key)!.push(p)
      } else {
        map.set(key, [p])
      }
    }

    // Drop empty buckets
    return Array.from(map.entries()).filter(([, ps]) => ps.length > 0)
  }, [filtered])

  function toggle(id: string) {
    if (selected.includes(id)) {
      onChange(selected.filter((x) => x !== id))
    } else {
      onChange([...selected, id])
    }
  }

  const label = (key: string) =>
    key === '__other__' ? 'Other' : (COMPANY_TYPE_LABELS[key] ?? key)

  return (
    <div className="space-y-3">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search partners…"
        className="bg-[#1a1a1a] border-white/8 text-white placeholder:text-[#8A8A8A] focus-visible:ring-[#60FDFF]"
      />

      {selected.length > 0 && (
        <p className="text-xs text-[#60FDFF]">
          {selected.length} partner{selected.length !== 1 ? 's' : ''} selected
        </p>
      )}

      <div className="space-y-4 max-h-80 overflow-y-auto pr-1 scrollbar-thin">
        {groups.length === 0 && (
          <p className="text-sm text-[#8A8A8A]">No matching partners.</p>
        )}

        {groups.map(([key, ps]) => (
          <div key={key}>
            <p className="text-[10px] font-bold tracking-[0.18em] uppercase text-[#8A8A8A] mb-1.5">
              {label(key)}
            </p>
            <div className="flex flex-wrap gap-2">
              {ps.map((p) => {
                const active = selected.includes(p.id)
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggle(p.id)}
                    className={[
                      'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                      active
                        ? 'bg-[#60FDFF]/15 text-[#60FDFF] border border-[#60FDFF]/40'
                        : 'bg-[#1a1a1a] text-white border border-white/8 hover:border-white/20 hover:bg-white/6',
                    ].join(' ')}
                  >
                    {active && <Check className="size-3 shrink-0" />}
                    {p.name}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
