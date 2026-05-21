import * as React from 'react'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'

export interface ReferralNotificationEmailProps {
  submitterEmail: string
  contactName: string
  contactEmail: string
  companyName: string
  companyId: string
  partnerNames: string[]
  notes?: string
  contactOwnerName?: string
  companyOwnerName?: string
}

export function ReferralNotificationEmail({
  submitterEmail,
  contactName,
  contactEmail,
  companyName,
  companyId,
  partnerNames,
  notes,
  contactOwnerName,
  companyOwnerName,
}: ReferralNotificationEmailProps) {
  const hubspotLink = `https://app.hubspot.com/contacts/308777/company/${companyId}`
  const partnerList = partnerNames.join(', ')

  return (
    <Html lang="en">
      <Head />
      <Preview>New referral: {companyName} → {partnerList}</Preview>
      <Body style={body}>
        <Container style={container}>

          {/* Header */}
          <Section style={header}>
            <Text style={headerEyebrow}>Avenue Z</Text>
            <Heading as="h1" style={headerTitle}>New Partner Referral</Heading>
          </Section>

          {/* Main card */}
          <Section style={card}>
            <Heading as="h2" style={sectionLabel}>Referral Details</Heading>

            <Row label="Company" value={companyName} />
            <Row label="Contact" value={`${contactName} — ${contactEmail}`} />
            <Row label="Referred to" value={partnerList} highlight />

            {notes && <Row label="Notes" value={notes} />}

            <Hr style={divider} />

            <Heading as="h2" style={sectionLabel}>Ownership</Heading>

            <Row label="Submitted by" value={submitterEmail} />
            {contactOwnerName && <Row label="Contact owner" value={contactOwnerName} />}
            {companyOwnerName && <Row label="Company owner" value={companyOwnerName} />}

            <Hr style={divider} />

            <Text style={linkText}>
              <a href={hubspotLink} style={linkAnchor}>
                View {companyName} in HubSpot →
              </a>
            </Text>
          </Section>

          <Text style={footer}>Avenue Z Partner Portal · automated notification</Text>
        </Container>
      </Body>
    </Html>
  )
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Section style={rowWrap}>
      <Text style={rowLabel}>{label}</Text>
      <Text style={highlight ? rowValueHighlight : rowValue}>{value}</Text>
    </Section>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────────

const body: React.CSSProperties = {
  backgroundColor: '#f4f4f5',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  margin: 0,
  padding: '40px 0',
}

const container: React.CSSProperties = {
  maxWidth: '560px',
  margin: '0 auto',
}

const header: React.CSSProperties = {
  backgroundColor: '#09090b',
  borderRadius: '10px 10px 0 0',
  padding: '28px 32px 24px',
}

const headerEyebrow: React.CSSProperties = {
  color: '#a1a1aa',
  fontSize: '12px',
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  margin: '0 0 6px',
}

const headerTitle: React.CSSProperties = {
  color: '#ffffff',
  fontSize: '22px',
  fontWeight: 700,
  margin: 0,
  lineHeight: 1.3,
}

const card: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '0 0 10px 10px',
  padding: '28px 32px 32px',
}

const sectionLabel: React.CSSProperties = {
  color: '#71717a',
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  margin: '0 0 12px',
}

const rowWrap: React.CSSProperties = {
  marginBottom: '10px',
}

const rowLabel: React.CSSProperties = {
  color: '#71717a',
  fontSize: '12px',
  margin: '0 0 2px',
}

const rowValue: React.CSSProperties = {
  color: '#09090b',
  fontSize: '14px',
  fontWeight: 500,
  margin: 0,
}

const rowValueHighlight: React.CSSProperties = {
  ...rowValue,
  color: '#2563eb',
}

const divider: React.CSSProperties = {
  borderColor: '#e4e4e7',
  margin: '20px 0',
}

const linkText: React.CSSProperties = {
  margin: 0,
}

const linkAnchor: React.CSSProperties = {
  color: '#2563eb',
  fontSize: '14px',
  fontWeight: 500,
  textDecoration: 'none',
}

const footer: React.CSSProperties = {
  color: '#a1a1aa',
  fontSize: '11px',
  textAlign: 'center',
  marginTop: '20px',
}
