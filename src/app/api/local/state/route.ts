import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { getLocalCoursesDir } from '@/lib/server-config';
import { CourseLibraryState } from '@/types/course';


export async function GET() {
  if (process.env.VERCEL) {
    return NextResponse.json({ state: null, isVercel: true });
  }
  const rootDir = await getLocalCoursesDir();
  if (!rootDir) {
    return NextResponse.json({ error: 'Courses directory not configured' }, { status: 400 });
  }

  const sidecarPath = path.join(rootDir, 'courseplex.json');
  if (fs.existsSync(sidecarPath)) {
    try {
      const raw = await fs.promises.readFile(sidecarPath, 'utf-8');
      const state: CourseLibraryState = JSON.parse(raw);
      return NextResponse.json({ state });
    } catch (e) {
      return NextResponse.json({ error: 'Failed to read sidecar file' }, { status: 500 });
    }
  }

  return NextResponse.json({ state: null });
}

export async function POST(req: NextRequest) {
  const rootDir = await getLocalCoursesDir();
  if (!rootDir) {
    return NextResponse.json({ error: 'Courses directory not configured' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { state } = body;
    if (!state) {
      return NextResponse.json({ error: 'state object is required' }, { status: 400 });
    }

    const sidecarPath = path.join(rootDir, 'courseplex.json');
    await fs.promises.writeFile(sidecarPath, JSON.stringify(state, null, 2), 'utf-8');

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to write sidecar file';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
