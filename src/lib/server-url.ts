const STORAGE_KEY = 'courseplex_server_url';

/** Base URL of the CoursePlex server this browser is talking to ('' = same origin). */
export function getServerBase(): string {
  if (typeof window === 'undefined') return '';
  try {
    return (localStorage.getItem(STORAGE_KEY) || '').replace(/\/+$/, '');
  } catch {
    return '';
  }
}

export function setServerBase(url: string | null): void {
  if (typeof window === 'undefined') return;
  if (!url) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, normalizeServerUrl(url));
}

export function normalizeServerUrl(input: string): string {
  let url = input.trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  // Default CoursePlex port if none given
  const host = url.replace(/^https?:\/\//i, '').split('/')[0];
  if (!/:\d+$/.test(host)) url = `${url}:32433`;
  return url;
}

/** Prefix an `/api/...` path with the configured server base. Absolute URLs pass through. */
export function apiUrl(path: string | undefined | null): string {
  if (!path) return '';
  if (!path.startsWith('/')) return path;
  return `${getServerBase()}${path}`;
}
