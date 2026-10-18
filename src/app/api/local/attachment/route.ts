import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { getLocalCoursesDir } from '@/lib/server-config';

export async function GET(req: NextRequest) {
  const rootDir = await getLocalCoursesDir();
  if (!rootDir) {
    return NextResponse.json({ error: 'Courses directory not configured' }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const relativePath = searchParams.get('path');
  const isDownload = searchParams.get('download') === '1';

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
    const stat = await fs.promises.stat(fullPath);
    if (!stat.isFile()) {
      return NextResponse.json({ error: 'Not a file' }, { status: 404 });
    }

    const filename = path.basename(fullPath);
    const ext = path.extname(fullPath).toLowerCase().replace('.', '');

    const mimeTypes: Record<string, string> = {
      // Images
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      gif: 'image/gif',
      bmp: 'image/bmp',
      avif: 'image/avif',
      // Documents
      pdf: 'application/pdf',
      txt: 'text/plain; charset=utf-8',
      md: 'text/markdown; charset=utf-8',
      json: 'application/json',
      // Code
      js: 'text/javascript; charset=utf-8',
      ts: 'text/plain; charset=utf-8',
      py: 'text/plain; charset=utf-8',
      html: 'text/html; charset=utf-8',
      css: 'text/css; charset=utf-8',
      sql: 'text/plain; charset=utf-8',
      sh: 'text/plain; charset=utf-8',
      yaml: 'text/yaml; charset=utf-8',
      yml: 'text/yaml; charset=utf-8',
      // Archives
      zip: 'application/zip',
      tar: 'application/x-tar',
      gz: 'application/gzip',
      '7z': 'application/x-7z-compressed',
      rar: 'application/vnd.rar',
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';
    const disposition = isDownload
      ? `attachment; filename="${encodeURIComponent(filename)}"`
      : `inline; filename="${encodeURIComponent(filename)}"`;

    const fileStream = fs.createReadStream(fullPath);
    const webStream = Readable.toWeb(fileStream) as ReadableStream;

    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': stat.size.toString(),
        'Content-Disposition': disposition,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}
