import { NextResponse } from 'next/server';
import { getLocalCoursesDir } from '@/lib/server-config';
import { scanServerDirectory } from '@/lib/server-scanner';


export async function GET() {
  if (process.env.VERCEL) {
    return NextResponse.json({
      configured: false,
      courses: [],
      clusters: [],
      libraryState: null,
      coursesDir: null,
      isVercel: true,
    });
  }
  const dir = await getLocalCoursesDir();
  if (!dir) {
    return NextResponse.json({
      configured: false,
      courses: [],
      clusters: [],
      libraryState: null,
      coursesDir: null,
    });
  }

  try {
    const { courses, clusters, libraryState } = await scanServerDirectory(dir);
    return NextResponse.json({
      configured: true,
      courses,
      clusters,
      libraryState,
      coursesDir: dir,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error scanning directory';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
