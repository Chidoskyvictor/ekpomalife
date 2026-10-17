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
      throw new Error(`Resend failed (${response.status}): ${body}`)
    }
    return { provider: 'resend' as const }
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
    return { provider: 'smtp' as const }
  }

  // Local / LAN testing without a mail provider.
  console.info('[mail:dev]', { to: input.to, subject: input.subject, text: input.text })
  return { provider: 'dev' as const }
}
