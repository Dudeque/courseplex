const AUTH_TOKEN_KEY = 'courseplex_auth_session';

// Master passcode ('fpa2bvwa') and its SHA-256 hash
const DEFAULT_PASSCODE = 'fpa2bvwa';
const DEFAULT_PASSCODE_HASH = '8be1a77a3547ac80acbe6795436292a4e492d765e8eb4a729e1f073b2575c5c6';

export async function hashString(input: string): Promise<string | null> {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    return null;
  }
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

  // Fallback for HTTP LAN origins (e.g. http://192.168.x.x:32433) where crypto.subtle is unavailable
  const inputHash = await hashString(passcode);
  if (inputHash === null) {
    return passcode === DEFAULT_PASSCODE;
  }
  return inputHash === DEFAULT_PASSCODE_HASH;
}

export function isDeviceAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY) === 'authenticated';
  } catch {
    return false;
  }
}

export function authenticateDevice(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(AUTH_TOKEN_KEY, 'authenticated');
  } catch {
    // ignore storage errors
  }
}

export function lockDevice(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    // ignore storage errors
  }
}
