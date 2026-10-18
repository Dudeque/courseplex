import {
  ScannedCourse,
  ScannedModule,
  ScannedLesson,
  ScannedAttachment,
  ScannedCluster,
  CourseLibraryState,
} from '@/types/course';

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export const VIDEO_EXTENSIONS = new Set([
  'mp4', 'mkv', 'webm', 'mov', 'm4v', 'avi', 'wmv', 'flv', 'ts', '3gp', 'm4p', 'mpg', 'mpeg', 'm2ts', 'vob', 'ogv',
]);
export const SUBTITLE_EXTENSIONS = new Set(['srt', 'vtt']);
export const NOTE_EXTENSIONS = new Set(['md', 'txt', 'html']);
export const ATTACHMENT_EXTENSIONS = new Set([
  // Archives
  'zip', 'tar', 'gz', '7z', 'rar', 'tgz', 'bz2', 'xz',
  // Documents & Slides
  'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'csv', 'epub',
  // Code & Notebooks
  'ipynb', 'py', 'js', 'ts', 'jsx', 'tsx', 'html', 'css', 'json', 'sql',
  'sh', 'bash', 'zsh', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'hpp', 'cs',
  'rb', 'php', 'swift', 'kt', 'yaml', 'yml', 'xml', 'toml', 'env',
  // Text & Notes
  'txt', 'md', 'rtf',
  // Images (diagrams, cheatsheets, slides)
  'png', 'jpg', 'jpeg', 'webp', 'svg',
]);
export const COVER_NAMES = new Set([
  'cover.jpg', 'cover.jpeg', 'cover.png', 'cover.webp',
  'poster.jpg', 'poster.jpeg', 'poster.png', 'poster.webp',
  'folder.jpg', 'folder.jpeg', 'folder.png', 'folder.webp',
]);

export const IGNORED_DIRECTORIES = new Set([
  'node_modules', '.git', '.next', '.turbo', 'dist', 'build', 'coverage',
  '__pycache__', '.venv', 'venv', 'vendor', '.cache', '.vscode', '.idea',
  'library', '$recycle.bin', 'system volume information'
]);

export async function isMpegTsFileInBrowser(file: File): Promise<boolean> {
  if (file.size < 188) return false;
  try {
    const slice = file.slice(0, 189);
    const arrayBuffer = await slice.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    return bytes[0] === 0x47 && (bytes.length < 189 || bytes[188] === 0x47);
  } catch {
    return false;
  }
}

export async function isVideoFileHandle(handle: FileSystemFileHandle, filename: string): Promise<boolean> {
  if (filename.endsWith('.d.ts')) return false;
  const ext = getFileExtension(filename);
  if (!VIDEO_EXTENSIONS.has(ext)) return false;
  if (ext === 'ts') {
    try {
      const file = await handle.getFile();
      return isMpegTsFileInBrowser(file);
    } catch {
      return false;
    }
  }
  return true;
}

export const CLUSTER_COLORS = [
  '#6366f1', // Indigo
  '#8b5cf6', // Purple
  '#ec4899', // Pink
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#06b6d4', // Cyan
  '#3b82f6', // Blue
  '#f97316', // Orange
];

export function cleanTitle(rawName: string): { title: string; orderIndex: number } {
  // Strip file extension first if present
  let clean = rawName.replace(/\.[a-zA-Z0-9]+$/, '');

  // Extract leading order number if present: "01 - Introduction", "01. Introduction", "[01] Intro", "01_intro"
  let orderIndex = 9999;
  const match = clean.match(/^(\[(\d+)\]|(\d+))[\s._-]+/);
  if (match) {
    const num = parseInt(match[2] || match[3], 10);
    if (!isNaN(num)) {
      orderIndex = num;
    }
  }

  // Strip leading numbering pattern
  clean = clean.replace(/^(\[(\d+)\]|(\d+))[\s._-]+/, '');
  // Strip release tags like [1080p], (x264), [Complete]
  clean = clean.replace(/\[[^\]]*(1080p|720p|4k|x264|x265|hevc|web-dl|bluray)[^\]]*\]/gi, '');
  clean = clean.replace(/\([^)]*(1080p|720p|4k|x264|x265|hevc|web-dl|bluray)[^)]*\)/gi, '');
  // Normalize whitespace, hyphens and underscores
  clean = clean.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();

  if (!clean) clean = rawName;
  return { title: clean, orderIndex };
}

export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts.pop()!.toLowerCase() : '';
}

export function getBaseStem(filename: string): string {
  // Remove extension
  let base = filename.replace(/\.[a-zA-Z0-9]+$/, '');
  // Remove language suffix if present for subtitles: e.g. "lesson-01.en" -> "lesson-01"
  base = base.replace(/\.(en|es|fr|de|pt|ru|zh|ja|ko)$/i, '');
  return base.toLowerCase().trim();
}

export function isResourceDirectoryName(dirName: string): boolean {
  const lower = dirName.toLowerCase().replace(/[^a-z0-9]/g, '');
  return (
    lower.includes('resource') ||
    lower.includes('attachment') ||
    lower.includes('download') ||
    lower.includes('exercise') ||
    lower.includes('supplement') ||
    lower === 'assets' ||
    lower === 'code' ||
    lower === 'sourcecode' ||
    lower === 'projectfiles' ||
    lower === 'files'
  );
}

export function extractLessonNumber(str: string): number | null {
  if (!str) return null;
  const name = str.replace(/\.[a-zA-Z0-9]+$/, '').trim();

  // 1. Explicit indicator: "lesson-01", "lesson_01", "lesson 1", "lecture-2", "video-3", "l04", "lec-5"
  const explicitMatch = name.match(/\b(?:lesson|lecture|video|lec|les|l|item|step|part|chapter|ch)[\s._-]*(\d+)\b/i);
  if (explicitMatch) {
    const num = parseInt(explicitMatch[1], 10);
    if (!isNaN(num)) return num;
  }

  // 2. Leading number: "01 - starter", "01_code", "01.project", "[01] code", "(01) notes", "01"
  const leadingMatch = name.match(/^(\[(\d+)\]|\((\d+)\)|(\d+))[\s._-]+/);
  if (leadingMatch) {
    const num = parseInt(leadingMatch[2] || leadingMatch[3] || leadingMatch[4], 10);
    if (!isNaN(num)) return num;
  }

  // 3. Isolated number at start or separated by punctuation: e.g. "01.zip", "resource_01.zip", "03"
  const boundaryMatch = name.match(/(?:^|[\s._#-])(\d{1,3})(?:[\s._-]|$)/);
  if (boundaryMatch) {
    const num = parseInt(boundaryMatch[1], 10);
    if (!isNaN(num)) return num;
  }

  return null;
}

export function getAttachmentType(filename: string): 'pdf' | 'zip' | 'code' | 'doc' | 'image' | 'other' {
  const ext = getFileExtension(filename);
  if (ext === 'pdf') return 'pdf';
  if (['jpg', 'jpeg', 'png', 'webp', 'svg', 'gif', 'bmp', 'avif'].includes(ext)) return 'image';
  if (['zip', 'tar', 'gz', '7z', 'rar', 'tgz', 'bz2', 'xz'].includes(ext)) return 'zip';
  if (['ipynb', 'py', 'js', 'ts', 'jsx', 'tsx', 'html', 'css', 'json', 'sql', 'sh', 'bash', 'zsh', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'rb', 'php', 'swift', 'kt', 'yaml', 'yml', 'xml', 'toml', 'env'].includes(ext)) return 'code';
  if (['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'csv', 'txt', 'md', 'epub', 'rtf'].includes(ext)) return 'doc';
  return 'other';
}

export function matchAttachmentToLesson(
  attName: string,
  parentDirName: string | undefined,
  lessons: ScannedLesson[]
): ScannedLesson | null {
  if (lessons.length === 0) return null;

  // 1. Try matching by exact stem with lesson rawTitle
  const attStem = getBaseStem(attName);
  const stemMatch = lessons.find((l) => getBaseStem(l.rawTitle) === attStem);
  if (stemMatch) return stemMatch;

  // 2. Try extracting lesson number from filename or parent subfolder
  const numFromFilename = extractLessonNumber(attName);
  const numFromParent = parentDirName ? extractLessonNumber(parentDirName) : null;
  const targetNum = numFromFilename ?? numFromParent;

  if (targetNum !== null) {
    // Check orderIndex first
    const byOrder = lessons.find((l) => l.orderIndex === targetNum);
    if (byOrder) return byOrder;

    // Check if rawTitle starts with or contains that number
    const byRawTitle = lessons.find((l) => {
      const lesNum = extractLessonNumber(l.rawTitle);
      return lesNum !== null && lesNum === targetNum;
    });
    if (byRawTitle) return byRawTitle;
  }

  // 3. Title substring matching (min 4 characters)
  const cleanAttTitle = cleanTitle(attName).title.toLowerCase();
  if (cleanAttTitle.length >= 4) {
    const byTitle = lessons.find((l) => {
      const lesTitle = l.title.toLowerCase();
      return (
        lesTitle.length >= 4 &&
        (cleanAttTitle.includes(lesTitle) || lesTitle.includes(cleanAttTitle))
      );
    });
    if (byTitle) return byTitle;
  }

  // 4. Fallback: if filename indicates a course-wide/overview resource (e.g. syllabus, cheatsheet, overview)
  const lower = attName.toLowerCase();
  if (
    lower.includes('syllabus') ||
    lower.includes('overview') ||
    lower.includes('cheatsheet') ||
    lower.includes('cheat_sheet') ||
    lower.includes('course')
  ) {
    return lessons[0];
  }

  return null;
}

/**
 * Scan directory using FileSystemDirectoryHandle (Chrome, Edge, Opera, Arc)
 */
export interface DirItem {
  name: string;
  handle: FileSystemHandle;
  isDir: boolean;
}

export async function getDirHandleEntries(dirHandle: FileSystemDirectoryHandle): Promise<DirItem[]> {
  const items: DirItem[] = [];
  try {
    const dirWithEntries = dirHandle as unknown as { entries: () => AsyncIterable<[string, FileSystemHandle]> };
    if (typeof dirWithEntries.entries === 'function') {
      for await (const [name, handle] of dirWithEntries.entries()) {
        if (!IGNORED_DIRECTORIES.has(name.toLowerCase())) {
          items.push({ name, handle, isDir: handle.kind === 'directory' });
        }
      }
    } else {
      const dirWithValues = dirHandle as unknown as { values: () => AsyncIterable<FileSystemHandle> };
      for await (const handle of dirWithValues.values()) {
        if (!IGNORED_DIRECTORIES.has(handle.name.toLowerCase())) {
          items.push({ name: handle.name, handle, isDir: handle.kind === 'directory' });
        }
      }
    }
  } catch (err) {
    console.warn('Could not read directory handle entries:', err);
  }
  return items.sort((a, b) => collator.compare(a.name, b.name));
}

/**
 * Scan directory using FileSystemDirectoryHandle (Chrome, Edge, Opera, Arc)
 */
export async function scanFileSystemDirectory(
  rootDirHandle: FileSystemDirectoryHandle,
  onProgress?: (status: string) => void
): Promise<{ courses: ScannedCourse[]; clusters: ScannedCluster[] }> {
  onProgress?.('Reading root directory contents...');

  const rootEntries = await getDirHandleEntries(rootDirHandle);
  const rootDirs = rootEntries.filter((e) => e.isDir && !IGNORED_DIRECTORIES.has(e.name.toLowerCase()));

  const scannedCourses: ScannedCourse[] = [];
  const scannedClusters: ScannedCluster[] = [];

  // Determine whether top-level folders are Clusters or Courses
  for (let i = 0; i < rootDirs.length; i++) {
    const dirEntry = rootDirs[i];
    if (dirEntry.name.startsWith('.')) continue;

    onProgress?.(`Inspecting ${dirEntry.name}...`);
    const subHandle = dirEntry.handle as FileSystemDirectoryHandle;
    const subEntries = await getDirHandleEntries(subHandle);

    const hasDirectVideos = subEntries.some(
      (e) => !e.isDir && VIDEO_EXTENSIONS.has(getFileExtension(e.name)) && !e.name.endsWith('.d.ts')
    );
    const subSubDirs = subEntries.filter((e) => e.isDir && !e.name.startsWith('.'));

    let subDirsContainVideos = false;
    let subDirsAreCourses = false;

    for (const subSub of subSubDirs) {
      const subSubEntries = await getDirHandleEntries(subSub.handle as FileSystemDirectoryHandle);
      const subSubHasVideos = subSubEntries.some(
        (e) => !e.isDir && VIDEO_EXTENSIONS.has(getFileExtension(e.name)) && !e.name.endsWith('.d.ts')
      );
      if (subSubHasVideos) {
        subDirsContainVideos = true;
      }
      const deeperDirs = subSubEntries.filter((e) => e.isDir && !e.name.startsWith('.'));
      for (const deep of deeperDirs) {
        try {
          const deepEntries = await getDirHandleEntries(deep.handle as FileSystemDirectoryHandle);
          if (deepEntries.some((e) => !e.isDir && VIDEO_EXTENSIONS.has(getFileExtension(e.name)) && !e.name.endsWith('.d.ts'))) {
            subDirsAreCourses = true;
            break;
          }
        } catch {
          // Ignore
        }
      }
      if (subDirsAreCourses) break;
    }

    if (hasDirectVideos || (subDirsContainVideos && !subDirsAreCourses)) {
      // 2-Level hierarchy: dirEntry is a direct Course!
      const course = await parseCourseDirectory(
        subHandle,
        dirEntry.name,
        dirEntry.name,
        undefined,
        undefined
      );
      if (course) scannedCourses.push(course);
    } else if (subSubDirs.length > 0) {
      // 3-Level hierarchy: dirEntry is a Cluster / Track!
      const clusterId = `cluster-${dirEntry.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      const { title: clusterTitle } = cleanTitle(dirEntry.name);
      const clusterCoursePaths: string[] = [];

      for (const courseDir of subSubDirs) {
        onProgress?.(`Parsing ${dirEntry.name} / ${courseDir.name}...`);
        const courseHandle = courseDir.handle as FileSystemDirectoryHandle;
        const relativePath = `${dirEntry.name}/${courseDir.name}`;
        const course = await parseCourseDirectory(
          courseHandle,
          courseDir.name,
          relativePath,
          clusterId,
          clusterTitle
        );
        if (course) {
          scannedCourses.push(course);
          clusterCoursePaths.push(relativePath);
        }
      }

      if (clusterCoursePaths.length > 0) {
        scannedClusters.push({
          id: clusterId,
          name: clusterTitle,
          relativePath: dirEntry.name,
          color: CLUSTER_COLORS[scannedClusters.length % CLUSTER_COLORS.length],
          coursePaths: clusterCoursePaths,
        });
      }
    }
  }

  // Also check if root folder itself directly contains a single course (with direct videos or modules)
  if (scannedCourses.length === 0) {
    const rootCourse = await parseCourseDirectory(
      rootDirHandle,
      rootDirHandle.name || 'Local Course',
      '_root_',
      undefined,
      undefined
    );
    if (rootCourse) scannedCourses.push(rootCourse);
  }

  // Deep recursive discovery fallback: if shallow scan found 0 courses or 0 lessons,
  // walk all directory levels to discover and auto-organize all videos
  const totalLessonsFound = scannedCourses.reduce((acc, c) => acc + c.totalLessons, 0);
  if (scannedCourses.length === 0 || totalLessonsFound === 0) {
    onProgress?.('Deep scanning all subfolders for video files...');
    const deepResult = await deepScanFileSystemDirectory(rootDirHandle, onProgress);
    if (deepResult.courses.length > 0) {
      scannedCourses.length = 0;
      scannedClusters.length = 0;
      scannedCourses.push(...deepResult.courses);
      scannedClusters.push(...deepResult.clusters);
    }
  }

  return { courses: scannedCourses, clusters: scannedClusters };
}

interface DiscoveredHandleFile {
  name: string;
  ext: string;
  handle: FileSystemFileHandle;
  relPath: string;
  relDir: string;
}

async function collectAllHandleFiles(
  dirHandle: FileSystemDirectoryHandle,
  relDir: string,
  depth = 0,
  maxDepth = 8
): Promise<DiscoveredHandleFile[]> {
  if (depth > maxDepth) return [];
  const items = await getDirHandleEntries(dirHandle);
  const files: DiscoveredHandleFile[] = [];

  for (const item of items) {
    if (item.name.startsWith('.')) continue;
    if (IGNORED_DIRECTORIES.has(item.name.toLowerCase())) continue;

    if (item.isDir) {
      const nextRel = relDir ? `${relDir}/${item.name}` : item.name;
      const nested = await collectAllHandleFiles(
        item.handle as FileSystemDirectoryHandle,
        nextRel,
        depth + 1,
        maxDepth
      );
      files.push(...nested);
    } else {
      const ext = getFileExtension(item.name);
      const relPath = relDir ? `${relDir}/${item.name}` : item.name;
      files.push({
        name: item.name,
        ext,
        handle: item.handle as FileSystemFileHandle,
        relPath,
        relDir: relDir || '.',
      });
    }
  }

  return files;
}

async function deepScanFileSystemDirectory(
  rootDirHandle: FileSystemDirectoryHandle,
  onProgress?: (status: string) => void
): Promise<{ courses: ScannedCourse[]; clusters: ScannedCluster[] }> {
  onProgress?.('Recursively searching for video files...');
  const allFiles = await collectAllHandleFiles(rootDirHandle, '');

  const candidateVideos = allFiles.filter((f) => !f.name.endsWith('.d.ts') && VIDEO_EXTENSIONS.has(f.ext));
  const videoFiles: DiscoveredHandleFile[] = [];
  for (const f of candidateVideos) {
    if (f.ext === 'ts') {
      try {
        const file = await f.handle.getFile();
        if (await isMpegTsFileInBrowser(file)) {
          videoFiles.push(f);
        }
      } catch {
        // ignore
      }
    } else {
      videoFiles.push(f);
    }
  }

  if (videoFiles.length === 0) {
    return { courses: [], clusters: [] };
  }

  interface CourseBucket {
    courseKey: string;
    courseTitle: string;
    clusterId?: string;
    clusterName?: string;
    modules: Map<string, {
      moduleKey: string;
      moduleTitle: string;
      orderIndex: number;
      videos: DiscoveredHandleFile[];
    }>;
  }

  const courseMap = new Map<string, CourseBucket>();

  for (const v of videoFiles) {
    const parts = v.relDir === '.' ? [] : v.relDir.split('/');

    let courseKey = '_root_';
    let courseTitle = rootDirHandle.name || 'Local Course';
    let clusterId: string | undefined;
    let clusterName: string | undefined;
    let moduleKey = '_root_';
    let moduleTitle = 'Course Curriculum';

    if (parts.length === 0) {
      courseKey = '_root_';
      courseTitle = rootDirHandle.name || 'Local Course';
      moduleKey = '_root_';
      moduleTitle = 'Course Curriculum';
    } else if (parts.length === 1) {
      courseKey = parts[0];
      courseTitle = cleanTitle(parts[0]).title;
      moduleKey = parts[0];
      moduleTitle = 'Course Curriculum';
    } else if (parts.length === 2) {
      courseKey = parts[0];
      courseTitle = cleanTitle(parts[0]).title;
      moduleKey = `${parts[0]}/${parts[1]}`;
      moduleTitle = cleanTitle(parts[1]).title;
    } else if (parts.length === 3) {
      const last = parts[2].toLowerCase();
      if (['videos', 'video', 'content', 'lectures', 'lessons', 'media'].includes(last)) {
        courseKey = parts[0];
        courseTitle = cleanTitle(parts[0]).title;
        moduleKey = `${parts[0]}/${parts[1]}`;
        moduleTitle = cleanTitle(parts[1]).title;
      } else {
        clusterId = `cluster-${parts[0].toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        clusterName = cleanTitle(parts[0]).title;
        courseKey = `${parts[0]}/${parts[1]}`;
        courseTitle = cleanTitle(parts[1]).title;
        moduleKey = `${parts[0]}/${parts[1]}/${parts[2]}`;
        moduleTitle = cleanTitle(parts[2]).title;
      }
    } else {
      const last = parts[parts.length - 1].toLowerCase();
      let modIdx = parts.length - 1;
      if (['videos', 'video', 'content', 'lectures', 'lessons', 'media'].includes(last)) {
        modIdx = parts.length - 2;
      }
      const courseIdx = modIdx - 1;
      const clusterParts = parts.slice(0, courseIdx);

      if (clusterParts.length > 0) {
        clusterId = `cluster-${clusterParts[0].toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        clusterName = clusterParts.map((p) => cleanTitle(p).title).join(' / ');
      }

      courseKey = parts.slice(0, courseIdx + 1).join('/');
      courseTitle = cleanTitle(parts[courseIdx]).title;
      moduleKey = parts.slice(0, modIdx + 1).join('/');
      moduleTitle = cleanTitle(parts[modIdx]).title;
    }

    let bucket = courseMap.get(courseKey);
    if (!bucket) {
      bucket = {
        courseKey,
        courseTitle,
        clusterId,
        clusterName,
        modules: new Map(),
      };
      courseMap.set(courseKey, bucket);
    }

    let modBucket = bucket.modules.get(moduleKey);
    if (!modBucket) {
      const { orderIndex } = cleanTitle(moduleTitle);
      modBucket = {
        moduleKey,
        moduleTitle,
        orderIndex,
        videos: [],
      };
      bucket.modules.set(moduleKey, modBucket);
    }

    modBucket.videos.push(v);
  }

  const subtitleFiles = allFiles.filter((f) => SUBTITLE_EXTENSIONS.has(f.ext));
  const coverFiles = allFiles.filter((f) => COVER_NAMES.has(f.name.toLowerCase()));

  const courses: ScannedCourse[] = [];
  const clusterMap = new Map<string, { id: string; name: string; coursePaths: string[] }>();

  for (const bucket of courseMap.values()) {
    let coverUrl: string | undefined;
    let coverFile: File | undefined;

    const matchedCover = coverFiles.find(
      (c) => c.relDir === (bucket.courseKey === '_root_' ? '.' : bucket.courseKey)
    );
    if (matchedCover) {
      try {
        coverFile = await matchedCover.handle.getFile();
        coverUrl = URL.createObjectURL(coverFile);
      } catch {
        // ignore
      }
    }

    const courseModules: ScannedModule[] = [];
    let modFallbackOrder = 1;

    for (const mod of bucket.modules.values()) {
      const lessons: ScannedLesson[] = [];
      let lesFallbackOrder = 1;

      for (const v of mod.videos) {
        const { title, orderIndex } = cleanTitle(v.name);
        const vStem = v.name.replace(/\.[a-zA-Z0-9]+$/, '').toLowerCase().trim();

        const matchedSubs: { name: string; lang: string; file?: File; handle?: FileSystemFileHandle }[] = [];
        const dirSubs = subtitleFiles.filter((s) => s.relDir === v.relDir);
        for (const s of dirSubs) {
          const sStem = s.name.replace(/\.(en|es|fr|de|pt|ru|zh|ja|ko)?\.[a-zA-Z0-9]+$/, '').toLowerCase().trim();
          if (sStem === vStem || sStem.includes(vStem) || vStem.includes(sStem)) {
            const langMatch = s.name.match(/\.(en|es|fr|de|pt|ru|zh|ja|ko)\.(srt|vtt)$/i);
            const lang = langMatch ? langMatch[1].toLowerCase() : 'en';
            try {
              const subFile = await s.handle.getFile();
              matchedSubs.push({ name: s.name, lang, file: subFile, handle: s.handle });
            } catch {
              matchedSubs.push({ name: s.name, lang, handle: s.handle });
            }
          }
        }

        let videoFile: File | undefined;
        try {
          videoFile = await v.handle.getFile();
        } catch {
          // ignore
        }

        lessons.push({
          id: `lesson-${v.relPath}`,
          title,
          rawTitle: v.name,
          orderIndex: orderIndex !== 9999 ? orderIndex : lesFallbackOrder++,
          relativePath: bucket.courseKey === '_root_' ? v.name : v.relPath,
          coursePath: bucket.courseKey,
          modulePath: mod.moduleKey,
          isVideo: true,
          isResourceOnly: false,
          durationSeconds: 0,
          videoFile,
          videoHandle: v.handle,
          subtitleFiles: matchedSubs,
          attachments: [],
        });
      }

      lessons.sort((a, b) => {
        if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex;
        return collator.compare(a.title, b.title);
      });

      if (lessons.length > 0) {
        courseModules.push({
          id: `mod-${mod.moduleKey}`,
          title: mod.moduleTitle,
          rawTitle: mod.moduleTitle,
          orderIndex: mod.orderIndex !== 9999 ? mod.orderIndex : modFallbackOrder++,
          relativePath: mod.moduleKey,
          lessons,
        });
      }
    }

    courseModules.sort((a, b) => {
      if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex;
      return collator.compare(a.title, b.title);
    });

    if (courseModules.length > 0) {
      let totalLessons = 0;
      for (const m of courseModules) totalLessons += m.lessons.length;

      const course: ScannedCourse = {
        id: bucket.courseKey === '_root_' ? 'course-root' : `course-${bucket.courseKey}`,
        title: bucket.courseTitle,
        rawTitle: bucket.courseTitle,
        relativePath: bucket.courseKey,
        clusterId: bucket.clusterId,
        clusterName: bucket.clusterName,
        coverUrl,
        coverFile,
        modules: courseModules,
        totalLessons,
        totalDurationSeconds: 0,
        courseDirHandle: rootDirHandle,
      };

      courses.push(course);

      if (bucket.clusterId && bucket.clusterName) {
        const existingCluster = clusterMap.get(bucket.clusterId) || {
          id: bucket.clusterId,
          name: bucket.clusterName,
          coursePaths: [],
        };
        existingCluster.coursePaths.push(bucket.courseKey);
        clusterMap.set(bucket.clusterId, existingCluster);
      }
    }
  }

  courses.sort((a, b) => collator.compare(a.title, b.title));

  const clusters: ScannedCluster[] = [];
  let colorIdx = 0;
  for (const c of clusterMap.values()) {
    clusters.push({
      id: c.id,
      name: c.name,
      relativePath: c.id,
      color: CLUSTER_COLORS[colorIdx++ % CLUSTER_COLORS.length],
      coursePaths: c.coursePaths,
    });
  }

  return { courses, clusters };
}

interface ScannedResourceItem {
  name: string;
  relativePath: string;
  file?: File;
  handle?: FileSystemFileHandle;
  parentDirName?: string;
}

async function collectFilesFromDirHandle(
  dHandle: FileSystemDirectoryHandle,
  currPath: string,
  parentName?: string
): Promise<ScannedResourceItem[]> {
  const list: ScannedResourceItem[] = [];
  const entries: { name: string; handle: FileSystemHandle; isDir: boolean }[] = [];
  const dirWithEntries = dHandle as unknown as { entries: () => AsyncIterable<[string, FileSystemHandle]> };
  if (typeof dirWithEntries.entries === 'function') {
    for await (const [name, handle] of dirWithEntries.entries()) {
      entries.push({ name, handle, isDir: handle.kind === 'directory' });
    }
  } else {
    const dirWithValues = dHandle as unknown as { values: () => AsyncIterable<FileSystemHandle> };
    for await (const handle of dirWithValues.values()) {
      entries.push({ name: handle.name, handle, isDir: handle.kind === 'directory' });
    }
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isDir) {
      const nested = await collectFilesFromDirHandle(
        entry.handle as FileSystemDirectoryHandle,
        `${currPath}/${entry.name}`,
        entry.name
      );
      list.push(...nested);
    } else {
      const ext = getFileExtension(entry.name);
      if (ATTACHMENT_EXTENSIONS.has(ext)) {
        let file: File | undefined;
        try {
          file = await (entry.handle as FileSystemFileHandle).getFile();
        } catch {
          // file can be lazily loaded via handle
        }
        list.push({
          name: entry.name,
          relativePath: `${currPath}/${entry.name}`,
          file,
          handle: entry.handle as FileSystemFileHandle,
          parentDirName: parentName,
        });
      }
    }
  }
  return list;
}

async function parseCourseDirectory(
  courseHandle: FileSystemDirectoryHandle,
  folderName: string,
  relativePath: string,
  clusterId?: string,
  clusterName?: string
): Promise<ScannedCourse | null> {
  const { title: cleanCourseTitle } = cleanTitle(folderName);
  let coverFile: File | undefined;
  let coverUrl: string | undefined;

  const entries: { name: string; handle: FileSystemHandle; isDir: boolean }[] = [];
  const dirWithEntries = courseHandle as unknown as { entries: () => AsyncIterable<[string, FileSystemHandle]> };
  if (typeof dirWithEntries.entries === 'function') {
    for await (const [name, handle] of dirWithEntries.entries()) {
      entries.push({ name, handle, isDir: handle.kind === 'directory' });
    }
  } else {
    const dirWithValues = courseHandle as unknown as { values: () => AsyncIterable<FileSystemHandle> };
    for await (const handle of dirWithValues.values()) {
      entries.push({ name: handle.name, handle, isDir: handle.kind === 'directory' });
    }
  }

  // Look for cover image
  for (const entry of entries) {
    if (!entry.isDir && COVER_NAMES.has(entry.name.toLowerCase())) {
      const file = await (entry.handle as FileSystemFileHandle).getFile();
      coverFile = file;
      coverUrl = URL.createObjectURL(file);
      break;
    }
  }

  const subDirs = entries.filter((e) => e.isDir && !e.name.startsWith('.'));
  subDirs.sort((a, b) => collator.compare(a.name, b.name));

  const rootFiles = entries.filter((e) => !e.isDir && !e.name.startsWith('.'));
  rootFiles.sort((a, b) => collator.compare(a.name, b.name));

  // Separate curriculum module folders from companion resource folders
  const moduleDirs: typeof entries = [];
  const resourceDirs: typeof entries = [];

  for (const subDir of subDirs) {
    if (isResourceDirectoryName(subDir.name)) {
      resourceDirs.push(subDir);
    } else {
      moduleDirs.push(subDir);
    }
  }

  // Recursively collect all attachments from course-level resource folders
  const courseResourceItems: ScannedResourceItem[] = [];
  for (const rDir of resourceDirs) {
    const res = await collectFilesFromDirHandle(
      rDir.handle as FileSystemDirectoryHandle,
      `${relativePath}/${rDir.name}`,
      rDir.name
    );
    courseResourceItems.push(...res);
  }

  const modules: ScannedModule[] = [];

  // Parse curriculum module folders
  if (moduleDirs.length > 0) {
    for (let i = 0; i < moduleDirs.length; i++) {
      const subDir = moduleDirs[i];
      const { title: modTitle, orderIndex } = cleanTitle(subDir.name);
      const modHandle = subDir.handle as FileSystemDirectoryHandle;
      const modPath = `${relativePath}/${subDir.name}`;
      const lessons = await parseLessonsInDirectory(modHandle, modPath, relativePath);

      if (lessons.length > 0) {
        modules.push({
          id: `mod-${modPath}`,
          title: modTitle,
          rawTitle: subDir.name,
          orderIndex: orderIndex !== 9999 ? orderIndex : i + 1,
          relativePath: modPath,
          lessons,
        });
      }
    }
  }

  // If there are direct files in course root, create a default module for them
  if (rootFiles.length > 0) {
    const rootLessons = await parseLessonsFromEntries(rootFiles, relativePath, relativePath);
    if (rootLessons.length > 0) {
      if (modules.length === 0) {
        modules.push({
          id: `mod-${relativePath}-root`,
          title: cleanCourseTitle || 'Course Curriculum',
          rawTitle: folderName,
          orderIndex: 1,
          relativePath,
          lessons: rootLessons,
        });
      } else {
        // Prepend or append root lessons module
        modules.unshift({
          id: `mod-${relativePath}-intro`,
          title: 'Introduction & Overview',
          rawTitle: 'Overview',
          orderIndex: 0,
          relativePath,
          lessons: rootLessons,
        });
      }
    }
  }

  if (modules.length === 0) return null;

  // Match collected course-level resources to lessons across the course
  const allCourseLessons = modules.flatMap((m) => m.lessons);
  for (const item of courseResourceItems) {
    const matched = matchAttachmentToLesson(item.name, item.parentDirName, allCourseLessons);
    if (matched) {
      if (!matched.attachments.some((a) => a.name === item.name || a.relativePath === item.relativePath)) {
        matched.attachments.push({
          name: item.name,
          type: getAttachmentType(item.name),
          relativePath: item.relativePath,
          file: item.file,
          handle: item.handle,
        });
      }
    }
  }

  let totalLessons = 0;
  let totalDurationSeconds = 0;
  for (const mod of modules) {
    totalLessons += mod.lessons.length;
    for (const les of mod.lessons) {
      totalDurationSeconds += les.durationSeconds;
    }
  }

  return {
    id: `course-${relativePath}`,
    title: cleanCourseTitle,
    rawTitle: folderName,
    relativePath,
    clusterId,
    clusterName,
    coverUrl,
    coverFile,
    modules,
    totalLessons,
    totalDurationSeconds,
    courseDirHandle: courseHandle,
  };
}

async function parseLessonsInDirectory(
  dirHandle: FileSystemDirectoryHandle,
  modulePath: string,
  coursePath: string
): Promise<ScannedLesson[]> {
  const entries: { name: string; handle: FileSystemHandle; isDir: boolean }[] = [];
  const dirWithEntries = dirHandle as unknown as { entries: () => AsyncIterable<[string, FileSystemHandle]> };
  if (typeof dirWithEntries.entries === 'function') {
    for await (const [name, handle] of dirWithEntries.entries()) {
      if (!handle.name.startsWith('.')) {
        entries.push({ name, handle, isDir: handle.kind === 'directory' });
      }
    }
  } else {
    const dirWithValues = dirHandle as unknown as { values: () => AsyncIterable<FileSystemHandle> };
    for await (const handle of dirWithValues.values()) {
      if (!handle.name.startsWith('.')) {
        entries.push({ name: handle.name, handle, isDir: handle.kind === 'directory' });
      }
    }
  }

  // Check if module contains a resources/ folder
  const moduleResourceItems: ScannedResourceItem[] = [];
  for (const entry of entries) {
    if (entry.isDir && isResourceDirectoryName(entry.name)) {
      const res = await collectFilesFromDirHandle(
        entry.handle as FileSystemDirectoryHandle,
        `${modulePath}/${entry.name}`,
        entry.name
      );
      moduleResourceItems.push(...res);
    }
  }

  entries.sort((a, b) => collator.compare(a.name, b.name));
  const lessons = await parseLessonsFromEntries(entries, modulePath, coursePath);

  // Attach module-level resources to lessons in this module
  for (const item of moduleResourceItems) {
    const matched = matchAttachmentToLesson(item.name, item.parentDirName, lessons);
    if (matched) {
      if (!matched.attachments.some((a) => a.name === item.name || a.relativePath === item.relativePath)) {
        matched.attachments.push({
          name: item.name,
          type: getAttachmentType(item.name),
          relativePath: item.relativePath,
          file: item.file,
          handle: item.handle,
        });
      }
    }
  }

  return lessons;
}

async function parseLessonsFromEntries(
  entries: { name: string; handle: FileSystemHandle; isDir: boolean }[],
  modulePath: string,
  coursePath: string
): Promise<ScannedLesson[]> {
  // Stem grouping
  interface StemGroup {
    stem: string;
    videoEntry?: { name: string; handle: FileSystemFileHandle };
    subtitleEntries: { name: string; handle: FileSystemFileHandle }[];
    noteEntry?: { name: string; handle: FileSystemFileHandle };
    attachments: { name: string; handle: FileSystemFileHandle }[];
  }

  const stemGroups = new Map<string, StemGroup>();
  const looseResourceEntries: { name: string; handle: FileSystemFileHandle }[] = [];

  for (const entry of entries) {
    if (entry.isDir) continue;
    const ext = getFileExtension(entry.name);
    const stem = getBaseStem(entry.name);
    const fileHandle = entry.handle as FileSystemFileHandle;

    const isVid = await isVideoFileHandle(fileHandle, entry.name);
    if (isVid) {
      const group = stemGroups.get(stem) || { stem, subtitleEntries: [], attachments: [] };
      group.videoEntry = { name: entry.name, handle: fileHandle };
      stemGroups.set(stem, group);
    } else if (SUBTITLE_EXTENSIONS.has(ext)) {
      const group = stemGroups.get(stem) || { stem, subtitleEntries: [], attachments: [] };
      group.subtitleEntries.push({ name: entry.name, handle: fileHandle });
      stemGroups.set(stem, group);
    } else if (NOTE_EXTENSIONS.has(ext)) {
      const group = stemGroups.get(stem) || { stem, subtitleEntries: [], attachments: [] };
      group.noteEntry = { name: entry.name, handle: fileHandle };
      stemGroups.set(stem, group);
    } else if (ATTACHMENT_EXTENSIONS.has(ext)) {
      const group = stemGroups.get(stem);
      if (group && group.videoEntry) {
        group.attachments.push({ name: entry.name, handle: fileHandle });
      } else {
        looseResourceEntries.push({ name: entry.name, handle: fileHandle });
      }
    }
  }

  // If no direct videos were found in module root, check non-resource subdirectories (e.g. Videos/, Content/)
  if (!Array.from(stemGroups.values()).some((g) => g.videoEntry)) {
    const videoSubDirs = entries.filter((e) => e.isDir && !isResourceDirectoryName(e.name) && !IGNORED_DIRECTORIES.has(e.name.toLowerCase()));
    for (const vSub of videoSubDirs) {
      const nestedEntries = await getDirHandleEntries(vSub.handle as FileSystemDirectoryHandle);
      for (const nested of nestedEntries.filter((i) => !i.isDir && !i.name.startsWith('.'))) {
        const ext = getFileExtension(nested.name);
        const stem = getBaseStem(nested.name);
        const fileHandle = nested.handle as FileSystemFileHandle;
        const isNestedVid = await isVideoFileHandle(fileHandle, nested.name);
        if (isNestedVid) {
          const group = stemGroups.get(stem) || { stem, subtitleEntries: [], attachments: [] };
          group.videoEntry = { name: `${vSub.name}/${nested.name}`, handle: fileHandle };
          stemGroups.set(stem, group);
        } else if (SUBTITLE_EXTENSIONS.has(ext)) {
          const group = stemGroups.get(stem) || { stem, subtitleEntries: [], attachments: [] };
          group.subtitleEntries.push({ name: `${vSub.name}/${nested.name}`, handle: fileHandle });
          stemGroups.set(stem, group);
        }
      }
    }
  }

  const lessons: ScannedLesson[] = [];

  // Convert stem groups with video to ScannedLesson
  for (const [, group] of stemGroups) {
    if (group.videoEntry) {
      const { title, orderIndex } = cleanTitle(group.videoEntry.name);
      const relativePath = `${modulePath}/${group.videoEntry.name}`;

      const videoFile = await group.videoEntry.handle.getFile();
      const subtitleFiles: { name: string; lang: string; file: File; handle: FileSystemFileHandle }[] = [];

      for (const sub of group.subtitleEntries) {
        const file = await sub.handle.getFile();
        subtitleFiles.push({
          name: sub.name,
          lang: sub.name.includes('.en.') ? 'en' : 'Default',
          file,
          handle: sub.handle,
        });
      }

      let noteFile: File | undefined;
      if (group.noteEntry) {
        noteFile = await group.noteEntry.handle.getFile();
      }

      const attachments: ScannedAttachment[] = [];
      for (const att of group.attachments) {
        const file = await att.handle.getFile();
        const type = getAttachmentType(att.name);
        attachments.push({
          name: att.name,
          type,
          relativePath: `${modulePath}/${att.name}`,
          file,
          handle: att.handle,
        });
      }

      lessons.push({
        id: `les-${relativePath}`,
        title,
        rawTitle: group.videoEntry.name,
        orderIndex,
        relativePath,
        coursePath,
        modulePath,
        isVideo: true,
        isResourceOnly: false,
        durationSeconds: 0,
        videoFile,
        videoHandle: group.videoEntry.handle,
        subtitleFiles,
        noteFile,
        noteHandle: group.noteEntry?.handle,
        attachments,
      });
    }
  }

  // Convert loose readings (e.g. README.md, cheat-sheet.pdf) into resource lessons
  for (const [, group] of stemGroups) {
    if (!group.videoEntry && group.noteEntry) {
      const { title, orderIndex } = cleanTitle(group.noteEntry.name);
      const relativePath = `${modulePath}/${group.noteEntry.name}`;
      const noteFile = await group.noteEntry.handle.getFile();

      lessons.push({
        id: `les-${relativePath}`,
        title: `[Reading] ${title}`,
        rawTitle: group.noteEntry.name,
        orderIndex,
        relativePath,
        coursePath,
        modulePath,
        isVideo: false,
        isResourceOnly: true,
        durationSeconds: 300, // 5 min reading estimate
        noteFile,
        noteHandle: group.noteEntry.handle,
        attachments: [],
      });
    }
  }

  // Try matching loose attachment files to lessons in this module by number or stem
  const unassignedLoose: { name: string; handle: FileSystemFileHandle }[] = [];
  for (const loose of looseResourceEntries) {
    const matched = matchAttachmentToLesson(loose.name, undefined, lessons);
    if (matched) {
      if (!matched.attachments.some((a) => a.name === loose.name)) {
        let file: File | undefined;
        try {
          file = await loose.handle.getFile();
        } catch {
          // ignore
        }
        matched.attachments.push({
          name: loose.name,
          type: getAttachmentType(loose.name),
          relativePath: `${modulePath}/${loose.name}`,
          file,
          handle: loose.handle,
        });
      }
    } else {
      unassignedLoose.push(loose);
    }
  }

  for (const loose of unassignedLoose) {
    const ext = getFileExtension(loose.name);
    if (ext === 'pdf' || ext === 'md') {
      const { title, orderIndex } = cleanTitle(loose.name);
      const relativePath = `${modulePath}/${loose.name}`;
      const file = await loose.handle.getFile();

      lessons.push({
        id: `les-${relativePath}`,
        title: `[Resource] ${title}`,
        rawTitle: loose.name,
        orderIndex,
        relativePath,
        coursePath,
        modulePath,
        isVideo: false,
        isResourceOnly: true,
        durationSeconds: 180,
        attachments: [
          {
            name: loose.name,
            type: ext === 'pdf' ? 'pdf' : 'doc',
            relativePath,
            file,
            handle: loose.handle,
          },
        ],
      });
    }
  }

  // Sort lessons by orderIndex then natural title
  lessons.sort((a, b) => {
    if (a.orderIndex !== b.orderIndex) {
      return a.orderIndex - b.orderIndex;
    }
    return collator.compare(a.title, b.title);
  });

  return lessons;
}

/**
 * Scan fallback for file list (from webkitdirectory input or drag-and-drop)
 */
export async function scanFileList(
  fileList: FileList | File[],
  onProgress?: (status: string) => void
): Promise<{ courses: ScannedCourse[]; clusters: ScannedCluster[]; sidecarState?: CourseLibraryState | null }> {
  onProgress?.('Parsing dropped course files...');
  const files = Array.from(fileList);

  // Look for sidecar state file (.courseplex-state.json)
  let sidecarState: CourseLibraryState | null = null;
  const sidecarFile = files.find(
    (f) => f.name === '.courseplex-state.json' || f.name === 'courseplex-state.json'
  );
  if (sidecarFile) {
    try {
      const text = await sidecarFile.text();
      const parsed = JSON.parse(text) as CourseLibraryState;
      if (parsed && typeof parsed === 'object') {
        sidecarState = parsed;
      }
    } catch (e) {
      console.warn('Failed to parse sidecar file from input:', e);
    }
  }

  interface PathNode {
    name: string;
    file?: File;
    children: Map<string, PathNode>;
  }

  const root: PathNode = { name: '', children: new Map() };

  for (const file of files) {
    const relativePath = file.webkitRelativePath || file.name;
    const parts = relativePath.split('/');
    let curr = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!curr.children.has(part)) {
        curr.children.set(part, { name: part, children: new Map() });
      }
      curr = curr.children.get(part)!;
      if (i === parts.length - 1) {
        curr.file = file;
      }
    }
  }

  // Unwrap browser directory wrapper if webkitRelativePath prefixed all paths with the selected top-level folder
  let effectiveRoot = root;
  if (root.children.size === 1) {
    const singleNode = root.children.values().next().value!;
    if (!singleNode.file && singleNode.children.size > 0) {
      const directVideos = Array.from(singleNode.children.values()).filter(
        (n) => n.file && VIDEO_EXTENSIONS.has(getFileExtension(n.file.name))
      );
      const subDirNodes = Array.from(singleNode.children.values()).filter(
        (n) => !n.file && !n.name.startsWith('.')
      );

      // Check which subdirectories contain videos (either directly or deeper)
      const subDirsWithVideos = subDirNodes.filter((sub) => {
        const hasVids = Array.from(sub.children.values()).some(
          (c) => c.file && VIDEO_EXTENSIONS.has(getFileExtension(c.file.name))
        );
        const hasSubVids = Array.from(sub.children.values()).some((c) =>
          !c.file && Array.from(c.children.values()).some((gc) => gc.file && VIDEO_EXTENSIONS.has(getFileExtension(gc.file.name)))
        );
        return hasVids || hasSubVids;
      });

      // If wrapper has no direct videos and contains multiple course candidates, unwrap it!
      if (directVideos.length === 0 && subDirsWithVideos.length > 1) {
        effectiveRoot = singleNode;
      } else if (directVideos.length === 0 && subDirsWithVideos.length === 1) {
        const onlySub = subDirsWithVideos[0];
        const hasNestedVids = Array.from(onlySub.children.values()).some((c) =>
          !c.file && Array.from(c.children.values()).some((gc) => gc.file && VIDEO_EXTENSIONS.has(getFileExtension(gc.file.name)))
        );
        if (hasNestedVids) {
          effectiveRoot = singleNode;
        }
      }
    }
  }

  // Build ScannedCourses from file tree
  const courses: ScannedCourse[] = [];
  const clusters: ScannedCluster[] = [];

  for (const [topName, topNode] of effectiveRoot.children.entries()) {
    if (topName.startsWith('.')) continue;

    const hasDirectVideos = Array.from(topNode.children.values()).some(
      (n) => n.file && VIDEO_EXTENSIONS.has(getFileExtension(n.file.name))
    );

    const subDirNodes = Array.from(topNode.children.values()).filter(
      (n) => !n.file && !n.name.startsWith('.')
    );

    let subDirsContainVideos = false;
    let subDirsAreCourses = false;

    for (const sub of subDirNodes) {
      const subHasDirectVideos = Array.from(sub.children.values()).some(
        (c) => c.file && VIDEO_EXTENSIONS.has(getFileExtension(c.file.name))
      );
      if (subHasDirectVideos) {
        subDirsContainVideos = true;
      }

      // Check if deeper directories have videos (which would make this a Cluster)
      const deeperHasVideos = Array.from(sub.children.values()).some((c) =>
        !c.file && Array.from(c.children.values()).some((gc) => gc.file && VIDEO_EXTENSIONS.has(getFileExtension(gc.file.name)))
      );
      if (deeperHasVideos) {
        subDirsAreCourses = true;
      }
    }

    if (hasDirectVideos || (subDirsContainVideos && !subDirsAreCourses)) {
      // 2-Level hierarchy: topNode is a direct Course!
      const course = parseCourseFromNode(topNode, topName, topName);
      if (course) courses.push(course);
    } else if (subDirNodes.length > 0) {
      // 3-Level hierarchy: topNode is a Cluster / Track!
      const clusterId = `cluster-${topName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      const { title: clusterTitle } = cleanTitle(topName);
      const clusterCourses: string[] = [];

      for (const [courseName, courseNode] of topNode.children.entries()) {
        if (courseName.startsWith('.')) continue;
        const relPath = `${topName}/${courseName}`;
        const course = parseCourseFromNode(courseNode, courseName, relPath, clusterId, clusterTitle);
        if (course) {
          courses.push(course);
          clusterCourses.push(relPath);
        }
      }

      if (clusterCourses.length > 0) {
        clusters.push({
          id: clusterId,
          name: clusterTitle,
          relativePath: topName,
          color: CLUSTER_COLORS[clusters.length % CLUSTER_COLORS.length],
          coursePaths: clusterCourses,
        });
      }
    }
  }

  // If effectiveRoot itself is a single course with videos or modules
  if (courses.length === 0) {
    const singleCandidate = root.children.size === 1 ? root.children.values().next().value! : root;
    const candidateName = singleCandidate.name || 'Local Course';
    const singleCourse = parseCourseFromNode(singleCandidate, candidateName, '_root_');
    if (singleCourse && singleCourse.modules.some((m) => m.lessons.length > 0)) {
      courses.push(singleCourse);
    }
  }

  // Deep scan fallback if no courses were structured conventionally
  if (courses.length === 0) {
    const videoFiles: File[] = [];
    for (const f of files) {
      if (f.name.endsWith('.d.ts')) continue;
      const ext = getFileExtension(f.name);
      if (VIDEO_EXTENSIONS.has(ext)) {
        videoFiles.push(f);
      }
    }

    if (videoFiles.length > 0) {
      const lessons = parseLessonsFromFileList(videoFiles, '_root_', '_root_');
      if (lessons.length > 0) {
        courses.push({
          id: 'course-_root_',
          title: 'Imported Videos',
          rawTitle: 'Imported Videos',
          relativePath: '_root_',
          modules: [
            {
              id: 'mod-_root_',
              title: 'Videos',
              rawTitle: 'Videos',
              orderIndex: 1,
              relativePath: '_root_',
              lessons,
            },
          ],
          totalDurationSeconds: 0,
          totalLessons: lessons.length,
        });
      }
    }
  }

  return { courses, clusters, sidecarState };
}

function parseCourseFromNode(
  node: { name: string; file?: File; children: Map<string, { name: string; file?: File; children: Map<string, unknown> }> },
  courseName: string,
  relativePath: string,
  clusterId?: string,
  clusterName?: string
): ScannedCourse | null {
  const { title: cleanCourseTitle } = cleanTitle(courseName);
  let coverUrl: string | undefined;
  let coverFile: File | undefined;

  // 1. Look for cover image in node.children
  for (const [name, child] of node.children.entries()) {
    if (child.file && COVER_NAMES.has(name.toLowerCase())) {
      coverFile = child.file;
      coverUrl = URL.createObjectURL(child.file);
      break;
    }
  }

  // 2. Separate direct files and subdirectories
  const directFiles: File[] = [];
  const moduleSubDirs: { name: string; node: { name: string; file?: File; children: Map<string, unknown> } }[] = [];
  const resourceSubDirs: { name: string; node: { name: string; file?: File; children: Map<string, unknown> } }[] = [];

  for (const [name, child] of node.children.entries()) {
    if (name.startsWith('.')) continue;
    if (child.file) {
      directFiles.push(child.file);
    } else if (child.children.size > 0) {
      if (isResourceDirectoryName(name)) {
        resourceSubDirs.push({ name, node: child });
      } else {
        moduleSubDirs.push({ name, node: child });
      }
    }
  }

  moduleSubDirs.sort((a, b) => collator.compare(a.name, b.name));

  // Recursively collect all files from course-level resource folders
  const courseResourceItems: { name: string; relativePath: string; file: File; parentDirName?: string }[] = [];
  for (const rDir of resourceSubDirs) {
    function collect(n: { name: string; file?: File; children: Map<string, unknown> }, currPath: string, parentName?: string) {
      for (const [, c] of n.children.entries()) {
        const childNode = c as { name: string; file?: File; children: Map<string, unknown> };
        if (childNode.name.startsWith('.')) continue;
        if (childNode.file) {
          const ext = getFileExtension(childNode.name);
          if (ATTACHMENT_EXTENSIONS.has(ext)) {
            courseResourceItems.push({
              name: childNode.name,
              relativePath: `${currPath}/${childNode.name}`,
              file: childNode.file,
              parentDirName: parentName,
            });
          }
        } else if (childNode.children && childNode.children.size > 0) {
          collect(childNode, `${currPath}/${childNode.name}`, childNode.name);
        }
      }
    }
    collect(rDir.node, `${relativePath}/${rDir.name}`, rDir.name);
  }

  const modules: ScannedModule[] = [];
  let modIndex = 1;

  // 3. Parse subdirectories as modules
  for (const subDir of moduleSubDirs) {
    const { title: modTitle, orderIndex } = cleanTitle(subDir.name);
    const modPath = `${relativePath}/${subDir.name}`;

    const subFiles: File[] = [];
    const moduleResourceFiles: { name: string; relativePath: string; file: File; parentDirName?: string }[] = [];

    function collectModuleFiles(n: { name: string; file?: File; children: Map<string, unknown> }, currPath: string) {
      for (const [childName, c] of n.children.entries()) {
        const childNode = c as { name: string; file?: File; children: Map<string, unknown> };
        if (childNode.name.startsWith('.')) continue;
        if (childNode.file) {
          subFiles.push(childNode.file);
        } else if (childNode.children && childNode.children.size > 0) {
          if (isResourceDirectoryName(childName)) {
            // Collect module resource subfolder files
            function collectRes(resNode: { name: string; file?: File; children: Map<string, unknown> }, resPath: string, parentName?: string) {
              for (const [, r] of resNode.children.entries()) {
                const rChild = r as { name: string; file?: File; children: Map<string, unknown> };
                if (rChild.file && ATTACHMENT_EXTENSIONS.has(getFileExtension(rChild.name))) {
                  moduleResourceFiles.push({
                    name: rChild.name,
                    relativePath: `${resPath}/${rChild.name}`,
                    file: rChild.file,
                    parentDirName: parentName,
                  });
                } else if (rChild.children && rChild.children.size > 0) {
                  collectRes(rChild, `${resPath}/${rChild.name}`, rChild.name);
                }
              }
            }
            collectRes(childNode, `${currPath}/${childName}`, childName);
          } else {
            collectModuleFiles(childNode, `${currPath}/${childName}`);
          }
        }
      }
    }
    collectModuleFiles(subDir.node, modPath);

    const lessons = parseLessonsFromFileList(subFiles, modPath, relativePath);

    // Attach module-level resources to lessons in this module
    for (const item of moduleResourceFiles) {
      const matched = matchAttachmentToLesson(item.name, item.parentDirName, lessons);
      if (matched) {
        if (!matched.attachments.some((a) => a.name === item.name || a.relativePath === item.relativePath)) {
          matched.attachments.push({
            name: item.name,
            type: getAttachmentType(item.name),
            relativePath: item.relativePath,
            file: item.file,
          });
        }
      }
    }

    if (lessons.length > 0) {
      modules.push({
        id: `mod-${modPath}`,
        title: modTitle,
        rawTitle: subDir.name,
        orderIndex: orderIndex !== 9999 ? orderIndex : modIndex++,
        relativePath: modPath,
        lessons,
      });
    }
  }

  // 4. Parse direct files in course root (for courses with flat videos)
  if (directFiles.length > 0) {
    const rootLessons = parseLessonsFromFileList(directFiles, relativePath, relativePath);
    if (rootLessons.length > 0) {
      if (modules.length === 0) {
        modules.push({
          id: `mod-${relativePath}-root`,
          title: cleanCourseTitle || 'Course Curriculum',
          rawTitle: courseName,
          orderIndex: 1,
          relativePath,
          lessons: rootLessons,
        });
      } else {
        modules.unshift({
          id: `mod-${relativePath}-intro`,
          title: 'Introduction & Overview',
          rawTitle: 'Overview',
          orderIndex: 0,
          relativePath,
          lessons: rootLessons,
        });
      }
    }
  }

  if (modules.length === 0) return null;

  // 5. Match course-level resources to lessons across the entire course
  const allCourseLessons = modules.flatMap((m) => m.lessons);
  for (const item of courseResourceItems) {
    const matched = matchAttachmentToLesson(item.name, item.parentDirName, allCourseLessons);
    if (matched) {
      if (!matched.attachments.some((a) => a.name === item.name || a.relativePath === item.relativePath)) {
        matched.attachments.push({
          name: item.name,
          type: getAttachmentType(item.name),
          relativePath: item.relativePath,
          file: item.file,
        });
      }
    }
  }

  modules.sort((a, b) => a.orderIndex - b.orderIndex || collator.compare(a.title, b.title));

  let totalLessons = 0;
  for (const mod of modules) {
    totalLessons += mod.lessons.length;
  }

  return {
    id: `course-${relativePath}`,
    title: cleanCourseTitle,
    rawTitle: courseName,
    relativePath,
    clusterId,
    clusterName,
    coverUrl,
    coverFile,
    modules,
    totalLessons,
    totalDurationSeconds: 0,
  };
}

function parseLessonsFromFileList(
  files: File[],
  modulePath: string,
  coursePath: string
): ScannedLesson[] {
  interface StemGroup {
    stem: string;
    videoFile?: File;
    subtitleFiles: { name: string; lang: string; file: File }[];
    noteFile?: File;
    attachments: ScannedAttachment[];
  }

  const stemGroups = new Map<string, StemGroup>();
  const looseResourceFiles: File[] = [];

  for (const file of files) {
    if (file.name.endsWith('.d.ts')) continue;
    const ext = getFileExtension(file.name);
    const stem = getBaseStem(file.name);

    if (VIDEO_EXTENSIONS.has(ext)) {
      const group = stemGroups.get(stem) || { stem, subtitleFiles: [], attachments: [] };
      group.videoFile = file;
      stemGroups.set(stem, group);
    } else if (SUBTITLE_EXTENSIONS.has(ext)) {
      const group = stemGroups.get(stem) || { stem, subtitleFiles: [], attachments: [] };
      group.subtitleFiles.push({
        name: file.name,
        lang: file.name.includes('.en.') ? 'en' : 'Default',
        file,
      });
      stemGroups.set(stem, group);
    } else if (NOTE_EXTENSIONS.has(ext)) {
      const group = stemGroups.get(stem) || { stem, subtitleFiles: [], attachments: [] };
      group.noteFile = file;
      stemGroups.set(stem, group);
    } else if (ATTACHMENT_EXTENSIONS.has(ext)) {
      const group = stemGroups.get(stem);
      const type = getAttachmentType(file.name);
      const att: ScannedAttachment = {
        name: file.name,
        type,
        relativePath: `${modulePath}/${file.name}`,
        file,
      };
      if (group && group.videoFile) {
        group.attachments.push(att);
      } else {
        looseResourceFiles.push(file);
      }
    }
  }

  const lessons: ScannedLesson[] = [];

  for (const [, group] of stemGroups) {
    if (group.videoFile) {
      const { title, orderIndex } = cleanTitle(group.videoFile.name);
      const lesPath = `${modulePath}/${group.videoFile.name}`;
      lessons.push({
        id: `les-${lesPath}`,
        title,
        rawTitle: group.videoFile.name,
        orderIndex,
        relativePath: lesPath,
        coursePath,
        modulePath,
        isVideo: true,
        isResourceOnly: false,
        durationSeconds: 0,
        videoFile: group.videoFile,
        subtitleFiles: group.subtitleFiles,
        noteFile: group.noteFile,
        attachments: group.attachments,
      });
    }
  }

  // Convert loose reading notes into resource lessons
  for (const [, group] of stemGroups) {
    if (!group.videoFile && group.noteFile) {
      const { title, orderIndex } = cleanTitle(group.noteFile.name);
      const lesPath = `${modulePath}/${group.noteFile.name}`;
      lessons.push({
        id: `les-${lesPath}`,
        title: `[Reading] ${title}`,
        rawTitle: group.noteFile.name,
        orderIndex,
        relativePath: lesPath,
        coursePath,
        modulePath,
        isVideo: false,
        isResourceOnly: true,
        durationSeconds: 300,
        noteFile: group.noteFile,
        attachments: [],
      });
    }
  }

  // Try matching loose attachment files to lessons in this module by number or stem
  const unassignedLoose: File[] = [];
  for (const loose of looseResourceFiles) {
    const matched = matchAttachmentToLesson(loose.name, undefined, lessons);
    if (matched) {
      if (!matched.attachments.some((a) => a.name === loose.name)) {
        matched.attachments.push({
          name: loose.name,
          type: getAttachmentType(loose.name),
          relativePath: `${modulePath}/${loose.name}`,
          file: loose,
        });
      }
    } else {
      unassignedLoose.push(loose);
    }
  }

  for (const loose of unassignedLoose) {
    const ext = getFileExtension(loose.name);
    if (ext === 'pdf' || ext === 'md') {
      const { title, orderIndex } = cleanTitle(loose.name);
      const lesPath = `${modulePath}/${loose.name}`;
      lessons.push({
        id: `les-${lesPath}`,
        title: `[Resource] ${title}`,
        rawTitle: loose.name,
        orderIndex,
        relativePath: lesPath,
        coursePath,
        modulePath,
        isVideo: false,
        isResourceOnly: true,
        durationSeconds: 180,
        attachments: [
          {
            name: loose.name,
            type: ext === 'pdf' ? 'pdf' : 'doc',
            relativePath: lesPath,
            file: loose,
          },
        ],
      });
    }
  }

  lessons.sort((a, b) => {
    if (a.orderIndex !== b.orderIndex) {
      return a.orderIndex - b.orderIndex;
    }
    return collator.compare(a.title, b.title);
  });

  return lessons;
}
