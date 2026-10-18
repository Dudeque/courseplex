const AUTH_TOKEN_KEY = 'courseplex_auth_session';

// Pre-computed SHA-256 hash of master passcode 'fpa2bvwa'
const DEFAULT_PASSCODE_HASH = '8be1a77a3547ac80acbe6795436292a4e492d765e8eb4a729e1f073b2575c5c6';

export async function hashString(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function getEnvPasscode(): string | null {
  return process.env.NEXT_PUBLIC_APP_PASSCODE || null;
}

export async function verifyPasscode(passcode: string): Promise<boolean> {
  const envPass = getEnvPasscode();
  if (envPass) {
    return passcode === envPass;
  }

  const inputHash = await hashString(passcode);
  return inputHash === DEFAULT_PASSCODE_HASH;
}

export function isDeviceAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(AUTH_TOKEN_KEY) === 'authenticated';
}

export function authenticateDevice(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(AUTH_TOKEN_KEY, 'authenticated');
}

export function lockDevice(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(AUTH_TOKEN_KEY);
}
