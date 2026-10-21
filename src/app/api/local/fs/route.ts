import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest, NextResponse, connection } from 'next/server';

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0',
};

async function listDrives(): Promise<{ name: string; path: string }[]> {
  if (process.platform !== 'win32') return [{ name: '/', path: '/' }];
  const drives: { name: string; path: string }[] = [];
  for (let c = 65; c <= 90; c++) {
    const letter = String.fromCharCode(c);
    const root = `${letter}:\\`;
    try {
      // statSync or existsSync is reliable on Windows drive roots without permission lockups
      if (fs.existsSync(root)) {
        drives.push({ name: `${letter}:`, path: root });
      }
    } catch {
      // drive not present or inaccessible
    }
  }
  return drives;
}

/** GET /api/local/fs?path=<dir>  -> subdirectories of dir (or drives / home when empty). */
export async function GET(req: NextRequest) {
  await connection();
  const requested = req.nextUrl.searchParams.get('path');
  const home = os.homedir();

  // If path is omitted, empty, or root navigation requested
  if (!requested || requested.trim() === '') {
    const shortcuts = ['Videos', 'Movies', 'Downloads', 'Documents', 'Desktop']
      .map((l) => ({ name: l, path: path.join(/*turbopackIgnore: true*/ home, l) }))
      .filter((d) => fs.existsSync(/*turbopackIgnore: true*/ d.path));
    return NextResponse.json(
      {
        path: null,
        parent: null,
        home,
        entries: [],
        drives: await listDrives(),
        shortcuts: [{ name: 'Home', path: home }, ...shortcuts],
      },
      { headers: NO_CACHE_HEADERS }
    );
  }

  const resolved = path.resolve(requested);

  // Check if we are at drive root on Windows (e.g. "C:\\" or "D:\\")
  const isWindowsDriveRoot =
    process.platform === 'win32' && /^[a-zA-Z]:\\?$/.test(resolved);

  try {
    const dirents = await fs.promises.readdir(/*turbopackIgnore: true*/ resolved, { withFileTypes: true });
    const entries = dirents
      .filter((d) => d.isDirectory() && !d.name.startsWith('.') && d.name !== 'node_modules')
      .map((d) => ({ name: d.name, path: path.join(resolved, d.name) }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    
    // When at a drive root (e.g. C:\) or filesystem root (/), parent is null (or root picker)
    let parentDir: string | null = null;
    if (!isWindowsDriveRoot && path.dirname(resolved) !== resolved) {
      parentDir = path.dirname(resolved);
    }

    return NextResponse.json(
      {
        path: resolved,
        parent: parentDir, // null signals that navigating up should go back to the Drive/Root selector
        entries,
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Cannot read directory';
    return NextResponse.json({ error: message }, { status: 400, headers: NO_CACHE_HEADERS });
  }
}
