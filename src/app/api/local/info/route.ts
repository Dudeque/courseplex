import os from 'node:os';
import { NextResponse } from 'next/server';
import { getLocalCoursesDir } from '@/lib/server-config';

export async function GET() {
  const port = Number(process.env.PORT) || 32433;
  const addresses: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === 'IPv4' && !ni.internal) addresses.push(ni.address);
    }
  }
  const dir = await getLocalCoursesDir();
  return NextResponse.json({
    app: 'courseplex',
    name: os.hostname(),
    platform: process.platform,
    port,
    configured: Boolean(dir),
    coursesDir: dir,
    lanUrls: addresses.map((a) => `http://${a}:${port}`),
  });
}
