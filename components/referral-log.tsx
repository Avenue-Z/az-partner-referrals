import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { ReferralLogEntry } from '@/lib/hubspot/client'

type Props = {
  entries: ReferralLogEntry[]
}

export function ReferralLog({ entries }: Props) {
  return (
    <Card className="bg-[#272727] border-white/8">
      <CardHeader className="pb-3">
        <CardTitle className="text-white text-xl">Recent Referrals</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {entries.length === 0 ? (
          <p className="text-[#8A8A8A] text-sm px-6 pb-6">No referrals logged yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-white/8 hover:bg-transparent">
                <TableHead className="text-[#8A8A8A] font-medium">Company</TableHead>
                <TableHead className="text-[#8A8A8A] font-medium">Referred To</TableHead>
                <TableHead className="text-[#8A8A8A] font-medium">Type</TableHead>
                <TableHead className="text-[#8A8A8A] font-medium">Logged By</TableHead>
                <TableHead className="text-[#8A8A8A] font-medium">Date</TableHead>
                <TableHead className="text-[#8A8A8A] font-medium">Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id} className="border-white/8 hover:bg-white/4">
                  <TableCell className="text-white font-medium">{entry.companyName}</TableCell>
                  <TableCell className="text-white">{entry.referredTo}</TableCell>
                  <TableCell>
                    <Badge
                      className={
                        entry.paidReferral === 'Paid'
                          ? 'bg-[#60FDFF]/10 text-[#60FDFF] border-[#60FDFF]/20 hover:bg-[#60FDFF]/10'
                          : 'bg-white/6 text-[#8A8A8A] border-white/8 hover:bg-white/6'
                      }
                      variant="outline"
                    >
                      {entry.paidReferral}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-[#8A8A8A]">{entry.ownerName}</TableCell>
                  <TableCell className="text-[#8A8A8A] whitespace-nowrap">{entry.dateModified}</TableCell>
                  <TableCell className="text-[#8A8A8A] max-w-[200px] truncate">{entry.notes || '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
