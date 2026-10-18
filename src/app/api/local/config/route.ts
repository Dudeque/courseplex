import { NextRequest, NextResponse } from 'next/server';
import { getLocalCoursesDir, setLocalCoursesDir, clearLocalCoursesDir } from '@/lib/server-config';

export async function GET() {
  const dir = await getLocalCoursesDir();
  return NextResponse.json({
    coursesDir: dir,
    configured: Boolean(dir),
  });
}

export async function POST(req: NextRequest) {
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
