import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export function normalizePath(p: string): string {
  let cleaned = p.trim().replace(/^["']|["']$/g, '');
  // Preserve Windows drive root: 'D:\' or 'D:/'
  if (/^[a-zA-Z]:[\\/]$/.test(cleaned)) {
    return cleaned.replace('/', '\\');
  }
  return cleaned.replace(/[\\/]+$/, '');
}

export async function isExistingDirectory(dirPath: string): Promise<boolean> {
  const normalized = normalizePath(dirPath);
  try {
    const stat = await fs.promises.stat(normalized);
    if (stat.isDirectory()) return true;
  } catch (statErr) {
    // Windows permissions or drive quirks can cause promises.stat to fail
    try {
      if (fs.existsSync(normalized)) {
        const syncStat = fs.statSync(normalized);
        if (syncStat.isDirectory()) return true;
      }
    } catch {
      // Ignored
    }
  }
  return false;
}

export function getConfigDir(): string {
  if (process.env.COURSEPLEX_USER_DATA && process.env.COURSEPLEX_USER_DATA.trim()) {
    return process.env.COURSEPLEX_USER_DATA.trim();
  }
  if (process.platform === 'win32' && process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'CoursePlex');
  }
  return path.join(os.homedir(), '.courseplex');
}

export function getCandidateConfigFilePaths(): string[] {
  const primaryDir = getConfigDir();
  return [
    path.join(primaryDir, 'courseplex-config.json'),
    path.join(primaryDir, '.courseplex-config.json'),
    path.join(os.homedir(), '.courseplex', 'config.json'),
    path.join(os.homedir(), '.courseplex', 'courseplex-config.json'),
    path.join(process.cwd(), '.courseplex-config.json'),
  ];
}

export async function getLocalCoursesDir(): Promise<string | null> {
  // 1. Check environment variable
  if (process.env.COURSES_DIR && process.env.COURSES_DIR.trim()) {
    const envDir = normalizePath(process.env.COURSES_DIR.trim());
    if (await isExistingDirectory(envDir)) {
      return envDir;
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
          const cleanDir = normalizePath(data.coursesDir);
          if (await isExistingDirectory(cleanDir)) {
            return cleanDir;
          } else {
            console.warn(`[server-config] Directory in ${configPath} does not exist or is not a directory:`, cleanDir);
          }
        }
      }
    } catch (e) {
      console.warn(`[server-config] Error reading candidate config ${configPath}:`, e);
    }
  }

  return null;
}

export async function setLocalCoursesDir(dirPath: string): Promise<string> {
  const cleaned = normalizePath(dirPath);
  const resolved = path.resolve(cleaned);
  if (!(await isExistingDirectory(resolved))) {
    throw new Error(`Path is not a valid directory: ${resolved}`);
  }

  const primaryDir = getConfigDir();
  await fs.promises.mkdir(primaryDir, { recursive: true });
  const targetFile = path.join(primaryDir, 'courseplex-config.json');

  const configContent = JSON.stringify({ coursesDir: resolved, updatedAt: new Date().toISOString() }, null, 2);

  await fs.promises.writeFile(
    /*turbopackIgnore: true*/ targetFile,
    configContent,
    'utf-8'
  );

  // Redundancy write to secondary location (~/.courseplex/config.json) to ensure cross-process discovery
  try {
    const secondaryDir = path.join(os.homedir(), '.courseplex');
    await fs.promises.mkdir(secondaryDir, { recursive: true });
    await fs.promises.writeFile(
      /*turbopackIgnore: true*/ path.join(secondaryDir, 'config.json'),
      configContent,
      'utf-8'
    );
  } catch {
    // Non-fatal
  }

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
