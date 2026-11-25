const authOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
export const phoneSignInEnabled = Boolean(authOrigin && publishableKey);
const sessionKey = 'diner-phone-session-v1';

export function dinerHeaders(phone?: string): Record<string, string> {
  if (!phone || typeof window === 'undefined') return {};
  try {
    const session = JSON.parse(sessionStorage.getItem(sessionKey) || 'null');
    if (session?.phone === phone && session.expires > Date.now() && session.token) {
      return { Authorization: `Bearer ${session.token}` };
    }
  } catch {}
  return {};
}

export function clearDinerSession() {
  sessionStorage.removeItem(sessionKey);
}

export async function verifyDinerPhone(phone: string, code?: string) {
  if (!phoneSignInEnabled || !/^\d{10}$/.test(phone)) throw new Error('Phone verification is unavailable.');
  const body = { phone: `+91${phone}`, ...(code ? { type: 'sms', token: code } : {}) };
  const res = await fetch(`${authOrigin}/auth/v1/${code ? 'verify' : 'otp'}`, {
    method: 'POST',
    headers: { apikey: publishableKey!, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(res.status === 429 ? 'Please wait before requesting another code.' :
    code ? 'Verification failed. Check the code or request a new one.' : 'The code could not be sent.');
  if (code) {
    const data = await res.json();
    if (!data.access_token || !data.expires_in) throw new Error('Verification returned no session.');
    sessionStorage.setItem(sessionKey, JSON.stringify({
      phone, token: data.access_token, expires: Date.now() + data.expires_in * 1000,
    }));
  }
}
