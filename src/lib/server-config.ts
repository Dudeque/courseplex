import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

function getConfigDir(): string {
  if (process.env.COURSEPLEX_USER_DATA && process.env.COURSEPLEX_USER_DATA.trim()) {
    return process.env.COURSEPLEX_USER_DATA.trim();
  }
  if (process.platform === 'win32' && process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'CoursePlex');
  }
  return path.join(os.homedir(), '.courseplex');
}

function getCandidateConfigFilePaths(): string[] {
  const primaryDir = getConfigDir();
  return [
    path.join(primaryDir, 'courseplex-config.json'),
    path.join(primaryDir, '.courseplex-config.json'),
    path.join(os.homedir(), '.courseplex', 'config.json'),
    path.join(process.cwd(), '.courseplex-config.json'),
  ];
}

export async function getLocalCoursesDir(): Promise<string | null> {
  // 1. Check environment variable
  if (process.env.COURSES_DIR && process.env.COURSES_DIR.trim()) {
    const envDir = process.env.COURSES_DIR.trim();
    try {
      const stat = await fs.promises.stat(envDir);
      if (stat.isDirectory()) return envDir;
    } catch {
      // Env var path invalid or inaccessible
    }
  }

  // 2. Check config files in candidate locations
  const candidatePaths = getCandidateConfigFilePaths();
  for (const configPath of candidatePaths) {
    try {
      if (fs.existsSync(/*turbopackIgnore: true*/ configPath)) {
        const raw = await fs.promises.readFile(/*turbopackIgnore: true*/ configPath, 'utf-8');
        const data = JSON.parse(raw);
        if (data.coursesDir && typeof data.coursesDir === 'string') {
          const stat = await fs.promises.stat(/*turbopackIgnore: true*/ data.coursesDir);
          if (stat.isDirectory()) {
            return data.coursesDir;
          }
        }
      }
    } catch {
      // Continue checking next candidate path
    }
  }

  return null;
}

export async function setLocalCoursesDir(dirPath: string): Promise<string> {
  const cleaned = dirPath.replace(/^["']|["']$/g, '').trim();
  const resolved = path.resolve(cleaned);
  const stat = await fs.promises.stat(/*turbopackIgnore: true*/ resolved);
  if (!stat.isDirectory()) {
    throw new Error('Path is not a valid directory');
  }

  const primaryDir = getConfigDir();
  await fs.promises.mkdir(primaryDir, { recursive: true });
  const targetFile = path.join(primaryDir, 'courseplex-config.json');

  await fs.promises.writeFile(
    /*turbopackIgnore: true*/ targetFile,
    JSON.stringify({ coursesDir: resolved, updatedAt: new Date().toISOString() }, null, 2),
    'utf-8'
  );

  return resolved;
}

export async function clearLocalCoursesDir(): Promise<void> {
  const candidatePaths = getCandidateConfigFilePaths();
  for (const configPath of candidatePaths) {
    try {
      if (fs.existsSync(/*turbopackIgnore: true*/ configPath)) {
        await fs.promises.unlink(/*turbopackIgnore: true*/ configPath);
      }
    } catch {
      // Ignore deletion errors
    }
  }
}

