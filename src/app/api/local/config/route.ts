import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest, NextResponse, connection } from 'next/server';
import { getLocalCoursesDir, setLocalCoursesDir, clearLocalCoursesDir } from '@/lib/server-config';

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0',
};

export async function GET(_req: NextRequest) {
  await connection();

  if (process.env.VERCEL) {
    return NextResponse.json(
      {
        coursesDir: null,
        configured: false,
        isVercel: true,
        suggestedDirs: [],
      },
      { headers: NO_CACHE_HEADERS }
    );
  }
  const dir = await getLocalCoursesDir();
  const home = os.homedir();
  const candidateDirs = [
    { label: 'Downloads', path: path.join(home, 'Downloads') },
    { label: 'Movies', path: path.join(home, 'Movies') },
    { label: 'Videos', path: path.join(home, 'Videos') },
    { label: 'Documents', path: path.join(home, 'Documents') },
    { label: 'Desktop', path: path.join(home, 'Desktop') },
  ];
  const suggestedDirs = candidateDirs.filter((d) => fs.existsSync(/*turbopackIgnore: true*/ d.path));

  return NextResponse.json(
    {
      coursesDir: dir,
      configured: Boolean(dir),
      suggestedDirs,
    },
    { headers: NO_CACHE_HEADERS }
  );
}

export async function POST(req: NextRequest) {
  if (process.env.VERCEL) {
    return NextResponse.json(
      { error: 'Server streaming mode is only available when running locally on your computer' },
      { status: 400, headers: NO_CACHE_HEADERS }
    );
  }
  try {
    const body = await req.json();
    const { coursesDir } = body;
    if (!coursesDir || typeof coursesDir !== 'string') {
      return NextResponse.json({ error: 'coursesDir is required' }, { status: 400, headers: NO_CACHE_HEADERS });
    }

    const savedDir = await setLocalCoursesDir(coursesDir);
    return NextResponse.json(
      {
        success: true,
        coursesDir: savedDir,
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid directory path';
    return NextResponse.json({ error: message }, { status: 400, headers: NO_CACHE_HEADERS });
  }
}

export async function DELETE() {
  await clearLocalCoursesDir();
  return NextResponse.json({ success: true, coursesDir: null }, { headers: NO_CACHE_HEADERS });
}
