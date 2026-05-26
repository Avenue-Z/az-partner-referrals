import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { ReferralLogEntry } from '@/lib/hubspot/client'

type Props = {
  entries: ReferralLogEntry[]
}

export function ReferralLog({ entries }: Props) {
  return (
    <Card className="bg-bg-surface border-white/[0.06]">
      <CardHeader className="pb-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-text-muted mb-1">Activity</p>
        <CardTitle className="text-xl font-extrabold uppercase text-white">Recent Referrals</CardTitle>
      </CardHeader>
      <div className="divider-full mx-6 mb-1" />
      <CardContent className="p-0">
        {entries.length === 0 ? (
          <p className="text-text-muted text-sm px-6 py-6">No referrals logged yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-white/[0.06] hover:bg-transparent">
                <TableHead className="text-text-muted text-xs font-bold uppercase tracking-widest">Company</TableHead>
                <TableHead className="text-text-muted text-xs font-bold uppercase tracking-widest">Referred To</TableHead>
                <TableHead className="text-text-muted text-xs font-bold uppercase tracking-widest">Logged By</TableHead>
                <TableHead className="text-text-muted text-xs font-bold uppercase tracking-widest">Date</TableHead>
                <TableHead className="text-text-muted text-xs font-bold uppercase tracking-widest">Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id} className="border-white/[0.06] hover:bg-white/[0.04]">
                  <TableCell className="text-white font-semibold">{entry.companyName}</TableCell>
                  <TableCell className="text-white">{entry.referredTo}</TableCell>
                  <TableCell className="text-text-muted">{entry.ownerName}</TableCell>
                  <TableCell className="text-text-muted whitespace-nowrap">{entry.dateModified}</TableCell>
                  <TableCell className="text-text-muted max-w-[200px] truncate">{entry.notes || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
