import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { getLocalCoursesDir, setLocalCoursesDir, clearLocalCoursesDir } from '@/lib/server-config';


export async function GET() {
  if (process.env.VERCEL) {
    return NextResponse.json({
      coursesDir: null,
      configured: false,
      isVercel: true,
      suggestedDirs: [],
    });
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

  return NextResponse.json({
    coursesDir: dir,
    configured: Boolean(dir),
    suggestedDirs,
  });
}

export async function POST(req: NextRequest) {
  if (process.env.VERCEL) {
    return NextResponse.json(
      { error: 'Server streaming mode is only available when running locally on your computer' },
      { status: 400 }
    );
  }
  try {
    const body = await req.json();
    const { coursesDir } = body;
    if (!coursesDir || typeof coursesDir !== 'string') {
      return NextResponse.json({ error: 'coursesDir is required' }, { status: 400 });
    }

    const savedDir = await setLocalCoursesDir(coursesDir);
    return NextResponse.json({
      success: true,
      coursesDir: savedDir,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid directory path';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE() {
  await clearLocalCoursesDir();
  return NextResponse.json({ success: true, coursesDir: null });
}
