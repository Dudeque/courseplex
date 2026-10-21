import { NextRequest, NextResponse, connection } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { getLocalCoursesDir } from '@/lib/server-config';
import { CourseLibraryState } from '@/types/course';

const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  'Pragma': 'no-cache',
  'Expires': '0',
};

export async function GET(_req: NextRequest) {
  await connection();
  if (process.env.VERCEL) {
    return NextResponse.json({ state: null, isVercel: true }, { headers: NO_CACHE_HEADERS });
  }
  const rootDir = await getLocalCoursesDir();
  if (!rootDir) {
    return NextResponse.json({ error: 'Courses directory not configured' }, { status: 400, headers: NO_CACHE_HEADERS });
  }

  const sidecarPath = path.join(rootDir, 'courseplex.json');
  if (fs.existsSync(sidecarPath)) {
    try {
      const raw = await fs.promises.readFile(sidecarPath, 'utf-8');
      const state: CourseLibraryState = JSON.parse(raw);
      return NextResponse.json({ state }, { headers: NO_CACHE_HEADERS });
    } catch {
      return NextResponse.json({ error: 'Failed to read sidecar file' }, { status: 500, headers: NO_CACHE_HEADERS });
    }
  }

  return NextResponse.json({ state: null }, { headers: NO_CACHE_HEADERS });
}

export async function POST(req: NextRequest) {
  const rootDir = await getLocalCoursesDir();
  if (!rootDir) {
    return NextResponse.json({ error: 'Courses directory not configured' }, { status: 400, headers: NO_CACHE_HEADERS });
  }

  try {
    const body = await req.json();
    const { state } = body;
    if (!state) {
      return NextResponse.json({ error: 'state object is required' }, { status: 400, headers: NO_CACHE_HEADERS });
    }

    const sidecarPath = path.join(rootDir, 'courseplex.json');
    await fs.promises.writeFile(sidecarPath, JSON.stringify(state, null, 2), 'utf-8');

    return NextResponse.json({ success: true }, { headers: NO_CACHE_HEADERS });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to write sidecar file';
    return NextResponse.json({ error: message }, { status: 500, headers: NO_CACHE_HEADERS });
  }
}
