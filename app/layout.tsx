import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Partner Referrals — Avenue Z',
  description: 'Log partner referrals for the Avenue Z sales team',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col bg-glow">{children}</body>
    </html>
  )
}
