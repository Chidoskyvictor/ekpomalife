/** Transactional reset email — visual language matches the lobby auth screens. */

const PRIMARY = '#4F6BF7'
const PRIMARY_DARK = '#3B52D4'
const INK = '#1B2433'
const MUTED = '#5B677A'
const BORDER = '#E3E8EF'
const WASH_TOP = '#DCE8FF'
const WASH_MID = '#EEF4FF'
const WHITE = '#FFFFFF'

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function normalizeAppUrl(appUrl: string) {
  return appUrl.replace(/\/$/, '')
}

function linkLabel(appUrl: string) {
  try {
    const url = new URL(appUrl)
    if (url.hostname === 'ekpomalife.app' || url.hostname === 'www.ekpomalife.app') {
      return 'ekpomalife.app'
    }
    return url.host
  } catch {
    return appUrl
  }
}

export function buildResetEmail(input: { name: string; code: string; appUrl: string }) {
  const name = input.name.trim() || 'there'
  const code = input.code.trim()
  const appUrl = normalizeAppUrl(input.appUrl)
  const forgotUrl = `${appUrl}/forgot`
  const hostLabel = linkLabel(appUrl)
  const safeName = escapeHtml(name)
  const safeCode = escapeHtml(code)
  const safeForgotUrl = escapeHtml(forgotUrl)
  const safeAppUrl = escapeHtml(appUrl)
  const safeHostLabel = escapeHtml(hostLabel)

  const subject = 'Your Ekpoma Life reset code'

  const text = [
    `Hi ${name},`,
    '',
    'Forgot your password? Open the app and enter this recovery code:',
    '',
    code,
    '',
    `Open Ekpoma Life: ${forgotUrl}`,
    '',
    'It expires in 12 minutes.',
    '',
    'If you did not ask for this, you can ignore this email.',
    '',
    `— Ekpoma Life (${appUrl})`,
  ].join('\n')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${subject}</title>
  <!--[if !mso]><!-->
  <link href="https://fonts.googleapis.com/css2?family=Boogaloo&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
  <!--<![endif]-->
</head>
<body style="margin:0;padding:0;background:${WASH_MID};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
    Your Ekpoma Life recovery code is ${safeCode}. It expires in 12 minutes.
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(180deg,${WASH_TOP} 0%,${WASH_MID} 45%,${WHITE} 100%);background-color:${WASH_MID};">
    <tr>
      <td align="center" style="padding:40px 16px 48px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:440px;">
          <tr>
            <td align="center" style="padding:0 0 18px;font-family:'Boogaloo',Georgia,'Times New Roman',serif;font-size:28px;line-height:1.15;letter-spacing:0.01em;">
              <a href="${safeAppUrl}" style="color:${INK};text-decoration:none;">Ekpoma Life</a>
            </td>
          </tr>
          <tr>
            <td style="background:${WHITE};border:1px solid ${BORDER};border-bottom:4px solid ${PRIMARY};border-radius:28px;padding:28px 28px 24px;box-shadow:0 18px 40px rgba(18,40,70,0.10);">
              <p style="margin:0 0 6px;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:${PRIMARY};">
                Password reset
              </p>
              <h1 style="margin:0 0 10px;font-family:'Boogaloo',Georgia,'Times New Roman',serif;font-size:30px;font-weight:400;line-height:1.15;color:${INK};">
                Forgot password?
              </h1>
              <p style="margin:0 0 22px;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.5;color:${MUTED};">
                Hi ${safeName} — enter this recovery code in the app to choose a new password.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;">
                <tr>
                  <td align="center" style="background:linear-gradient(180deg,${WASH_TOP},${WASH_MID});border:2px dashed ${PRIMARY};border-radius:20px;padding:18px 12px;">
                    <p style="margin:0 0 6px;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;font-size:12px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:${PRIMARY_DARK};">
                      Recovery code
                    </p>
                    <p style="margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:36px;font-weight:700;letter-spacing:0.28em;line-height:1.2;color:${INK};">
                      ${safeCode}
                    </p>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 20px;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.45;color:${MUTED};">
                Expires in <strong style="color:${INK};">12 minutes</strong>. Anyone with this code can change the password for this account.
              </p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;">
                <tr>
                  <td align="center" bgcolor="${PRIMARY}" style="border-radius:16px;background:linear-gradient(180deg,#7B8FFA 0%,${PRIMARY} 100%);box-shadow:0 5px 0 ${PRIMARY_DARK};">
                    <a href="${safeForgotUrl}" style="display:inline-block;padding:14px 22px;font-family:'Boogaloo',Georgia,'Times New Roman',serif;font-size:18px;line-height:1;color:${WHITE};text-decoration:none;">
                      Open Ekpoma Life ▶
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 14px;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.45;color:${MUTED};">
                Or go to <a href="${safeForgotUrl}" style="color:${PRIMARY};font-weight:500;text-decoration:underline;">${safeHostLabel}/forgot</a> and enter the code.
              </p>
              <p style="margin:0;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;font-size:13px;line-height:1.45;color:${MUTED};">
                Didn’t ask for this? You can ignore the email — nothing changes until the code is used.
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:18px 8px 0;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.45;color:${MUTED};">
              📚 &nbsp; 🛵 &nbsp; 🍛 &nbsp; 🎧<br />
              Sent by <a href="${safeAppUrl}" style="color:${PRIMARY};text-decoration:none;">Ekpoma Life</a> · <a href="${safeAppUrl}" style="color:${MUTED};text-decoration:none;">${safeHostLabel}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`

  return { subject, text, html }
}
