import { NextRequest, NextResponse, connection } from 'next/server';
import { getLocalCoursesDir, getCandidateConfigFilePaths } from '@/lib/server-config';
import { scanServerDirectory } from '@/lib/server-scanner';

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
        configured: false,
        courses: [],
        clusters: [],
        libraryState: null,
        coursesDir: null,
        isVercel: true,
      },
      { headers: NO_CACHE_HEADERS }
    );
  }

  const dir = await getLocalCoursesDir();
  if (!dir) {
    console.log('[api/local/courses] No coursesDir configured or directory inaccessible.');
    return NextResponse.json(
      {
        configured: false,
        courses: [],
        clusters: [],
        libraryState: null,
        coursesDir: null,
        _debug: {
          candidateConfigFilePaths: getCandidateConfigFilePaths(),
          coursesDirEnv: process.env.COURSES_DIR || null,
          time: new Date().toISOString(),
        },
      },
      { headers: NO_CACHE_HEADERS }
    );
  }

  try {
    console.log(`[api/local/courses] Scanning courses from: ${dir}`);
    const { courses, clusters, libraryState } = await scanServerDirectory(dir);
    console.log(`[api/local/courses] Scan complete. Found ${courses.length} courses, ${clusters.length} clusters.`);

    return NextResponse.json(
      {
        configured: true,
        courses,
        clusters,
        libraryState,
        coursesDir: dir,
      },
      { headers: NO_CACHE_HEADERS }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error scanning directory';
    console.error('[api/local/courses] Error scanning directory:', err);
    return NextResponse.json(
      { error: message, coursesDir: dir },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
