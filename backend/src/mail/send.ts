import { env } from '../env.js'

type SendMailInput = {
  to: string
  subject: string
  text: string
  html?: string
}

export async function sendMail(input: SendMailInput) {
  if (env.RESEND_API_KEY) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        html: input.html ?? input.text,
      }),
    })
    if (!response.ok) {
      const body = await response.text()
      // Status and Resend's reply only: never the API key or the email body (it holds the code)
      console.error('[mail] resend failed', { status: response.status, body })
      throw new Error(`Resend failed (${response.status}): ${body}`)
    }
    const data = (await response.json().catch(() => ({}))) as { id?: string }
    console.info('[mail] sent', { provider: 'resend', id: data.id ?? null })
    return { provider: 'resend' as const, id: data.id ?? null }
  }

  if (env.SMTP_URL) {
    const nodemailer = await import('nodemailer')
    const transport = nodemailer.createTransport(env.SMTP_URL)
    await transport.sendMail({
      from: env.MAIL_FROM,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html ?? input.text,
    })
    console.info('[mail] sent', { provider: 'smtp' })
    return { provider: 'smtp' as const }
  }

  if (env.NODE_ENV === 'production') {
    // Never pretend an email went out in production
    throw new Error('No mail provider configured (RESEND_API_KEY or SMTP_URL)')
  }

  // Local / LAN testing without a mail provider.
  console.info('[mail:dev]', { to: input.to, subject: input.subject, text: input.text })
  return { provider: 'dev' as const }
}
