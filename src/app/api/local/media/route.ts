import { NextRequest, NextResponse, connection } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { getLocalCoursesDir } from '@/lib/server-config';

export async function GET(req: NextRequest) {
  await connection();
  const rootDir = await getLocalCoursesDir();
  if (!rootDir) {
    return NextResponse.json({ error: 'Courses directory not configured' }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const relativePath = searchParams.get('path');
  if (!relativePath) {
    return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 });
  }

  const cleanRel = relativePath.replace(/^_root_[\/\\]/, '');
  const normalized = path.normalize(cleanRel).replace(/^(\.\.[\/\\])+/, '');
  const fullPath = path.resolve(rootDir, normalized);
  const rootResolved = path.resolve(rootDir);

  const relative = path.relative(rootResolved, fullPath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  try {
    const stat = await fs.promises.stat(fullPath);
    if (!stat.isFile()) {
      return NextResponse.json({ error: 'Not a file' }, { status: 404 });
    }

    const ext = path.extname(fullPath).toLowerCase().replace('.', '');
    const mimeTypes: Record<string, string> = {
      mp4: 'video/mp4',
      m4v: 'video/mp4',
      webm: 'video/webm',
      mkv: 'video/webm',
      mov: 'video/quicktime',
      avi: 'video/x-msvideo',
      wmv: 'video/x-ms-wmv',
      flv: 'video/x-flv',
      ts: 'video/mp2t',
      m2ts: 'video/mp2t',
      mpg: 'video/mpeg',
      mpeg: 'video/mpeg',
      vob: 'video/x-ms-vob',
      ogv: 'video/ogg',
      '3gp': 'video/3gpp',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      ogg: 'audio/ogg',
      aac: 'audio/aac',
    };
    const contentType = mimeTypes[ext] || 'video/mp4';
    const fileSize = stat.size;

    const range = req.headers.get('range');
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize || start > end) {
        return new NextResponse(null, {
          status: 416,
          headers: {
            'Content-Range': `bytes */${fileSize}`,
          },
        });
      }

      const chunkSize = end - start + 1;
      const fileStream = fs.createReadStream(fullPath, { start, end });
      const webStream = Readable.toWeb(fileStream) as ReadableStream;

      return new NextResponse(webStream, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize.toString(),
          'Content-Type': contentType,
        },
      });
    }

    const fileStream = fs.createReadStream(fullPath);
    const webStream = Readable.toWeb(fileStream) as ReadableStream;
    return new NextResponse(webStream, {
      status: 200,
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Length': fileSize.toString(),
        'Content-Type': contentType,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}
