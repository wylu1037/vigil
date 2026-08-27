// "Activation succeeded" notification via the Resend HTTP API.
// Cloudflare Workers cannot open SMTP connections, so this goes over HTTPS.

const ENDPOINT = "https://api.resend.com/emails";

export interface RecoveryInfo {
  at: Date; // when the successful attempt landed
  failures: number; // failed attempts in this block before it succeeded
  crossedBlocks: boolean; // previous block also ended in failure
  idempotencyKey: string; // stable per notification, dedupes at Resend
}

// Returns true only if Resend accepted the message.
export async function sendRecoveryEmail(
  env: Env,
  info: RecoveryInfo,
): Promise<boolean> {
  const stamp = info.at.toISOString();
  const scope = info.crossedBlocks
    ? "relay was down across multiple blocks"
    : "relay failed earlier in this block";

  try {
    const resp = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Idempotency-Key": info.idempotencyKey,
      },
      body: JSON.stringify({
        from: env.MAIL_FROM,
        to: [env.MAIL_TO],
        subject: "🎉 AI Router Recovered!!!",
        html: `
          <div style="background:#f4f6f8;padding:32px 16px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#1f2933;">
            <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e4e7eb;overflow:hidden;">
              <div style="background:#10b981;padding:20px 24px;">
                <div style="font-size:20px;font-weight:600;color:#ffffff;">✅ AI Router Recovered</div>
              </div>
              <div style="padding:24px;">
                <p style="margin:0 0 16px;font-size:15px;line-height:1.6;">
                  <strong>Activation succeeded.</strong> The relay is responding again.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 16px;font-size:14px;">
                  <tr>
                    <td style="padding:8px 0;border-bottom:1px solid #eef1f4;color:#6b7280;">Recovered at</td>
                    <td style="padding:8px 0;border-bottom:1px solid #eef1f4;text-align:right;font-family:Menlo,Consolas,monospace;">${stamp}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;border-bottom:1px solid #eef1f4;color:#6b7280;">Failed attempts</td>
                    <td style="padding:8px 0;border-bottom:1px solid #eef1f4;text-align:right;font-weight:600;">${info.failures}</td>
                  </tr>
                  <tr>
                    <td style="padding:8px 0;color:#6b7280;">Context</td>
                    <td style="padding:8px 0;text-align:right;">${scope}</td>
                  </tr>
                </table>
                <p style="margin:0;font-size:13px;color:#6b7280;">Back on the 2-minute keep-alive cadence.</p>
              </div>
            </div>
          </div>`,
      }),
    });

    const text = await resp.text();
    console.log(
      `[${stamp}] email status=${resp.status} body=${text.slice(0, 200)}`,
    );
    return resp.ok;
  } catch (e: unknown) {
    // Never let a mail failure disturb the ping loop
    console.error(`[${stamp}] email failed: ${String(e)}`);
    return false;
  }
}
