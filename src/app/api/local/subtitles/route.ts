import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { getLocalCoursesDir } from '@/lib/server-config';
import { convertSrtTextToVtt } from '@/lib/subtitles';

export async function GET(req: NextRequest) {
  const rootDir = await getLocalCoursesDir();
  if (!rootDir) {
    return NextResponse.json({ error: 'Courses directory not configured' }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const relativePath = searchParams.get('path');
  if (!relativePath) {
    return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 });
  }

  const normalized = path.normalize(relativePath).replace(/^(\.\.[\/\\])+/, '');
  const fullPath = path.resolve(rootDir, normalized);
  const rootResolved = path.resolve(rootDir);

  if (!fullPath.startsWith(rootResolved)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  try {
    const rawContent = await fs.promises.readFile(fullPath, 'utf-8');
    const vttContent = convertSrtTextToVtt(rawContent);

    return new NextResponse(vttContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/vtt; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: 'Subtitle file not found' }, { status: 404 });
  }
}
