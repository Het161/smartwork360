/**
 * Email templates.
 *
 * Table-based layout with inline styles throughout. Email clients (Outlook in
 * particular) do not reliably support flexbox, grid, or external stylesheets, so
 * the modern CSS used everywhere else in this project is exactly what would break
 * here. Colours match the GovTrust palette.
 */

const NAVY = '#14417B';
const SAFFRON = '#FF9933';
const GREEN = '#138808';
const CANVAS = '#F6F8FB';
const BORDER = '#E2E8F0';
const SLATE = '#475569';
const MUTED = '#64748B';

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/**
 * Absolute base for images in emails.
 *
 * `PUBLIC_WEB_URL` is accepted, but it falls back to `APP_BASE_URL` rather than
 * being a second required variable: the two would always have to hold the same
 * value, and when they drifted the sign-in link would work while the logo
 * silently broke — a difference nobody notices until a real user reports it.
 */
const WEB_URL = (process.env.PUBLIC_WEB_URL || process.env.APP_BASE_URL || 'http://localhost:3000')
  .replace(/\/+$/, '');

/**
 * The WHITE mark, and a PNG rather than the SVG.
 *
 * PNG because email clients — Outlook above all — do not reliably render SVG at
 * all. White because this sits on the navy header band: the default navy mark
 * would leave three orange squares floating on navy with the S invisible.
 */
const LOGO_URL = `${WEB_URL}/brand/mark-white-512.png`;

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${CANVAS};font-family:${FONT};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CANVAS};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid ${BORDER};border-radius:10px;overflow:hidden;">

          <!-- Navy header band -->
          <tr>
            <td style="background:${NAVY};padding:24px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding-right:14px;vertical-align:middle;">
                    <img src="${LOGO_URL}" width="56" height="56" alt="SMARTWORK 360"
                         style="display:block;width:56px;height:56px;border:0;outline:none;text-decoration:none;">
                  </td>
                  <td style="vertical-align:middle;">
                    <div style="color:#FFFFFF;font-size:18px;font-weight:700;letter-spacing:0.2px;">SMARTWORK <span style="color:${SAFFRON};">360</span></div>
                    <div style="color:rgba(255,255,255,0.72);font-size:12px;margin-top:2px;">स्मार्ट कार्य एवं प्रदर्शन प्रबंधन</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Tricolour rule -->
          <tr>
            <td style="font-size:0;line-height:0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td width="33.33%" height="3" style="background:${SAFFRON};font-size:0;line-height:0;">&nbsp;</td>
                  <td width="33.33%" height="3" style="background:#FFFFFF;font-size:0;line-height:0;">&nbsp;</td>
                  <td width="33.33%" height="3" style="background:${GREEN};font-size:0;line-height:0;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>

          ${body}

          <tr>
            <td style="padding:18px 28px 24px;border-top:1px solid ${BORDER};">
              <div style="color:${MUTED};font-size:11px;line-height:1.6;">
                Government Department Sandbox — do not share this code.<br>
                This is an automated message from a Smart India Hackathon prototype. Please do not reply.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function otpEmail(opts: { name: string; code: string; minutes: number }): {
  subject: string;
  html: string;
  text: string;
} {
  const body = `
          <tr>
            <td style="padding:28px 28px 8px;">
              <div style="color:#0F172A;font-size:17px;font-weight:600;">Namaste ${escapeHtml(opts.name)},</div>
              <div style="color:${SLATE};font-size:14px;line-height:1.7;margin-top:10px;">
                Use the verification code below to confirm your email address and continue your
                SMARTWORK 360 registration.
              </div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:22px 28px;">
              <div style="background:${CANVAS};border:1px solid ${BORDER};border-radius:10px;padding:22px 16px;">
                <div style="color:${MUTED};font-size:11px;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;">Verification code</div>
                <div style="color:${NAVY};font-size:32px;font-weight:700;letter-spacing:10px;font-family:'SF Mono',Consolas,Menlo,monospace;">${opts.code}</div>
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 24px;">
              <div style="color:${SLATE};font-size:13px;line-height:1.7;">
                This code is valid for <strong>${opts.minutes} minutes</strong>. If you did not request
                it, you can safely ignore this email — no account will be activated.
              </div>
            </td>
          </tr>`;

  return {
    subject: `${opts.code} is your SMARTWORK 360 verification code`,
    html: shell('Verify your email — SMARTWORK 360', body),
    text: [
      `Namaste ${opts.name},`,
      '',
      `Your SMARTWORK 360 verification code is: ${opts.code}`,
      `It is valid for ${opts.minutes} minutes.`,
      '',
      'Government Department Sandbox — do not share this code.',
    ].join('\n'),
  };
}

export function welcomeEmail(opts: {
  name: string;
  designation: string;
  department: string;
  signInUrl: string;
}): { subject: string; html: string; text: string } {
  const body = `
          <tr>
            <td style="padding:28px 28px 8px;">
              <div style="color:#0F172A;font-size:17px;font-weight:600;">Welcome aboard, ${escapeHtml(opts.name)}</div>
              <div style="color:${SLATE};font-size:14px;line-height:1.7;margin-top:10px;">
                Your account has been approved by the department administrator. You can now sign in
                to SMARTWORK 360 and see the tasks assigned to you.
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 28px 4px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CANVAS};border:1px solid ${BORDER};border-radius:10px;">
                <tr><td style="padding:16px 18px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;color:${SLATE};">
                    <tr>
                      <td style="padding:4px 0;color:${MUTED};width:110px;">Designation</td>
                      <td style="padding:4px 0;font-weight:600;">${escapeHtml(opts.designation)}</td>
                    </tr>
                    <tr>
                      <td style="padding:4px 0;color:${MUTED};">Department</td>
                      <td style="padding:4px 0;font-weight:600;">${escapeHtml(opts.department)}</td>
                    </tr>
                    <tr>
                      <td style="padding:4px 0;color:${MUTED};">Role</td>
                      <td style="padding:4px 0;font-weight:600;">Employee</td>
                    </tr>
                  </table>
                </td></tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:24px 28px;">
              <a href="${opts.signInUrl}" style="display:inline-block;background:${NAVY};color:#FFFFFF;text-decoration:none;font-size:14px;font-weight:600;padding:12px 28px;border-radius:8px;">Sign in to SMARTWORK 360</a>
              <div style="color:${MUTED};font-size:12px;margin-top:12px;">${escapeHtml(opts.signInUrl)}</div>
            </td>
          </tr>`;

  return {
    subject: 'Your SMARTWORK 360 account has been approved',
    html: shell('Account approved — SMARTWORK 360', body),
    text: [
      `Welcome aboard, ${opts.name}`,
      '',
      'Your account has been approved by the department administrator.',
      `Designation: ${opts.designation}`,
      `Department: ${opts.department}`,
      '',
      `Sign in: ${opts.signInUrl}`,
    ].join('\n'),
  };
}

/** Names and designations are user-supplied and land inside HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
