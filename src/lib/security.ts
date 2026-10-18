const PASSCODE_HASH_KEY = 'courseplex_passcode_hash';
const AUTH_TOKEN_KEY = 'courseplex_auth_session';

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

export function isPasscodeConfigured(): boolean {
  if (typeof window === 'undefined') return true;
  if (getEnvPasscode()) return true;
  return !!localStorage.getItem(PASSCODE_HASH_KEY);
}

export async function setInitialPasscode(passcode: string): Promise<void> {
  if (typeof window === 'undefined') return;
  const hash = await hashString(passcode);
  localStorage.setItem(PASSCODE_HASH_KEY, hash);
  authenticateDevice();
}

export async function verifyPasscode(passcode: string): Promise<boolean> {
  const envPass = getEnvPasscode();
  if (envPass) {
    return passcode === envPass;
  }

  if (typeof window === 'undefined') return false;
  const storedHash = localStorage.getItem(PASSCODE_HASH_KEY);
  if (!storedHash) return false;

  const inputHash = await hashString(passcode);
  return inputHash === storedHash;
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

export function resetPasscode(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(PASSCODE_HASH_KEY);
  localStorage.removeItem(AUTH_TOKEN_KEY);
}
