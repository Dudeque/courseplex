import fs from 'node:fs';
import path from 'node:path';

const PROJECT_CONFIG_FILE = path.join(process.cwd(), '.courseplex-config.json');

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

  // 2. Check local project config file
  try {
    if (fs.existsSync(PROJECT_CONFIG_FILE)) {
      const raw = await fs.promises.readFile(PROJECT_CONFIG_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (data.coursesDir && typeof data.coursesDir === 'string') {
        const stat = await fs.promises.stat(data.coursesDir);
        if (stat.isDirectory()) {
          return data.coursesDir;
        }
      }
    }
  } catch {
    // Ignore read errors
  }

  return null;
}

export async function setLocalCoursesDir(dirPath: string): Promise<string> {
  const resolved = path.resolve(dirPath.trim());
  const stat = await fs.promises.stat(resolved);
  if (!stat.isDirectory()) {
    throw new Error('Path is not a valid directory');
  }

  await fs.promises.writeFile(
    PROJECT_CONFIG_FILE,
    JSON.stringify({ coursesDir: resolved, updatedAt: new Date().toISOString() }, null, 2),
    'utf-8'
  );

  return resolved;
}

export async function clearLocalCoursesDir(): Promise<void> {
  if (fs.existsSync(PROJECT_CONFIG_FILE)) {
    await fs.promises.unlink(PROJECT_CONFIG_FILE);
  }
}
