import { Resend } from 'resend'

if (!process.env.RESEND_API_KEY) throw new Error('Missing env var: RESEND_API_KEY')

export const resend = new Resend(process.env.RESEND_API_KEY)
