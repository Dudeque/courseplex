import fs from 'node:fs';
import path from 'node:path';
import {
  ScannedCourse,
  ScannedModule,
  ScannedLesson,
  ScannedAttachment,
  ScannedCluster,
  CourseLibraryState,
} from '@/types/course';
import {
  cleanTitle,
  getFileExtension,
  isResourceDirectoryName,
  getAttachmentType,
  matchAttachmentToLesson,
} from '@/lib/scanner';

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const VIDEO_EXTENSIONS = new Set([
  'mp4', 'mkv', 'webm', 'mov', 'm4v', 'avi', 'wmv', 'flv', 'ts', '3gp', 'm4p', 'mpg', 'mpeg', 'm2ts', 'vob', 'ogv',
]);
const SUBTITLE_EXTENSIONS = new Set(['srt', 'vtt']);
const ATTACHMENT_EXTENSIONS = new Set([
  'zip', 'tar', 'gz', '7z', 'rar', 'tgz', 'bz2', 'xz',
  'pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'csv', 'epub',
  'ipynb', 'py', 'js', 'ts', 'jsx', 'tsx', 'html', 'css', 'json', 'sql',
  'sh', 'bash', 'zsh', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'hpp', 'cs',
  'rb', 'php', 'swift', 'kt', 'yaml', 'yml', 'xml', 'toml', 'env',
  'txt', 'md', 'rtf',
  'png', 'jpg', 'jpeg', 'webp', 'svg', 'gif', 'bmp', 'avif',
]);
const COVER_NAMES = new Set([
  'cover.jpg', 'cover.jpeg', 'cover.png', 'cover.webp',
  'poster.jpg', 'poster.jpeg', 'poster.png', 'poster.webp',
  'folder.jpg', 'folder.jpeg', 'folder.png', 'folder.webp',
]);

const IGNORED_DIRECTORIES = new Set([
  'node_modules', '.git', '.next', '.turbo', 'dist', 'build', 'coverage',
  '__pycache__', '.venv', 'venv', 'vendor', '.cache', '.vscode', '.idea',
  '$recycle.bin', 'system volume information'
]);

async function isMpegTsFile(filePath: string): Promise<boolean> {
  try {
    const fd = await fs.promises.open(filePath, 'r');
    const buffer = Buffer.alloc(189);
    const { bytesRead } = await fd.read(buffer, 0, 189, 0);
    await fd.close();
    if (bytesRead < 188) return false;
    return buffer[0] === 0x47 && (bytesRead < 189 || buffer[188] === 0x47);
  } catch {
    return false;
  }
}

async function isVideoFilePath(filePath: string, filename: string): Promise<boolean> {
  if (filename.endsWith('.d.ts')) return false;
  const ext = getFileExtension(filename);
  if (!VIDEO_EXTENSIONS.has(ext)) return false;
  if (ext === 'ts') {
    return isMpegTsFile(filePath);
  }
  return true;
}

const CLUSTER_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#06b6d4', '#3b82f6', '#f97316',
];

interface DiskItem {
  name: string;
  isDir: boolean;
  fullPath: string;
}

async function getDirItems(dirPath: string): Promise<DiskItem[]> {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const items: DiskItem[] = [];
    for (const e of entries) {
      if (IGNORED_DIRECTORIES.has(e.name.toLowerCase())) continue;
      let isDir = false;
      try {
        if (e.isDirectory()) {
          isDir = true;
        } else if (e.isFile()) {
          isDir = false;
        } else {
          // Reparse points, symlinks, or ambiguous types
          const stat = await fs.promises.stat(path.join(dirPath, e.name));
          isDir = stat.isDirectory();
        }
      } catch {
        // Fall back to Dirent check
        isDir = e.isDirectory();
      }
      items.push({
        name: e.name,
        isDir,
        fullPath: path.join(dirPath, e.name),
      });
    }
    return items.sort((a, b) => collator.compare(a.name, b.name));
  } catch (err) {
    console.warn(`Could not read directory ${dirPath}:`, err);
    return [];
  }
}

interface ServerResourceItem {
  name: string;
  relativePath: string;
  parentDirName?: string;
}

async function collectServerResourceFiles(
  dirPath: string,
  currRelPath: string,
  parentName?: string
): Promise<ServerResourceItem[]> {
  const list: ServerResourceItem[] = [];
  const items = await getDirItems(dirPath);

  for (const item of items) {
    if (item.name.startsWith('.')) continue;
    const rel = currRelPath ? `${currRelPath}/${item.name}` : item.name;

    if (item.isDir) {
      const nested = await collectServerResourceFiles(item.fullPath, rel, item.name);
      list.push(...nested);
    } else {
      const ext = getFileExtension(item.name);
      if (ATTACHMENT_EXTENSIONS.has(ext)) {
        list.push({
          name: item.name,
          relativePath: rel,
          parentDirName: parentName,
        });
      }
    }
  }

  return list;
}

async function parseServerLessonsInDir(
  dirPath: string,
  moduleRelPath: string,
  courseRelPath: string
): Promise<ScannedLesson[]> {
  const items = await getDirItems(dirPath);
  const fileItems = items.filter((i) => !i.isDir && !i.name.startsWith('.'));
  const subDirs = items.filter((i) => i.isDir && !i.name.startsWith('.'));

  // Separate companion resource directories
  const resourceDirs = subDirs.filter((d) => isResourceDirectoryName(d.name));
  const subResources: ServerResourceItem[] = [];
  for (const rDir of resourceDirs) {
    const collected = await collectServerResourceFiles(
      rDir.fullPath,
      `${moduleRelPath}/${rDir.name}`,
      rDir.name
    );
    subResources.push(...collected);
  }

  // Group files by base stem
  interface FileGroup {
    name: string;
    videoFile?: string;
    subtitles: { name: string; lang: string; relativePath: string }[];
    notes?: { name: string; relativePath: string };
    attachments: ScannedAttachment[];
  }

  const groups = new Map<string, FileGroup>();
  const looseAttachments: ScannedAttachment[] = [];

  for (const file of fileItems) {
    const ext = getFileExtension(file.name);
    const rel = `${moduleRelPath}/${file.name}`;

    const isVid = await isVideoFilePath(file.fullPath, file.name);
    if (isVid) {
      const stem = file.name.replace(/\.[a-zA-Z0-9]+$/, '').toLowerCase().trim();
      const existing = groups.get(stem) || { name: file.name, subtitles: [], attachments: [] };
      existing.videoFile = file.name;
      groups.set(stem, existing);
    } else if (SUBTITLE_EXTENSIONS.has(ext)) {
      const langMatch = file.name.match(/\.(en|es|fr|de|pt|ru|zh|ja|ko)\.(srt|vtt)$/i);
      const lang = langMatch ? langMatch[1].toLowerCase() : 'en';
      const stem = file.name.replace(/\.(en|es|fr|de|pt|ru|zh|ja|ko)?\.[a-zA-Z0-9]+$/, '').toLowerCase().trim();
      const existing = groups.get(stem) || { name: file.name, subtitles: [], attachments: [] };
      existing.subtitles.push({ name: file.name, lang, relativePath: rel });
      groups.set(stem, existing);
    } else if (['md', 'txt'].includes(ext)) {
      const stem = file.name.replace(/\.[a-zA-Z0-9]+$/, '').toLowerCase().trim();
      const existing = groups.get(stem) || { name: file.name, subtitles: [], attachments: [] };
      existing.notes = { name: file.name, relativePath: rel };
      groups.set(stem, existing);
    } else if (ATTACHMENT_EXTENSIONS.has(ext)) {
      looseAttachments.push({
        name: file.name,
        type: getAttachmentType(file.name),
        relativePath: rel,
      });
    }
  }

  // If no direct videos were found in module root, check non-resource subdirectories (e.g. Videos/, Content/)
  if (!Array.from(groups.values()).some((g) => g.videoFile)) {
    const videoSubDirs = subDirs.filter((d) => !isResourceDirectoryName(d.name));
    for (const vSub of videoSubDirs) {
      const nestedItems = await getDirItems(vSub.fullPath);
      for (const file of nestedItems.filter((i) => !i.isDir && !i.name.startsWith('.'))) {
        const ext = getFileExtension(file.name);
        const rel = `${moduleRelPath}/${vSub.name}/${file.name}`;
        const isNestedVid = await isVideoFilePath(file.fullPath, file.name);
        if (isNestedVid) {
          const stem = file.name.replace(/\.[a-zA-Z0-9]+$/, '').toLowerCase().trim();
          const existing = groups.get(stem) || { name: file.name, subtitles: [], attachments: [] };
          existing.videoFile = `${vSub.name}/${file.name}`;
          groups.set(stem, existing);
        } else if (SUBTITLE_EXTENSIONS.has(ext)) {
          const langMatch = file.name.match(/\.(en|es|fr|de|pt|ru|zh|ja|ko)\.(srt|vtt)$/i);
          const lang = langMatch ? langMatch[1].toLowerCase() : 'en';
          const stem = file.name.replace(/\.(en|es|fr|de|pt|ru|zh|ja|ko)?\.[a-zA-Z0-9]+$/, '').toLowerCase().trim();
          const existing = groups.get(stem) || { name: file.name, subtitles: [], attachments: [] };
          existing.subtitles.push({ name: file.name, lang, relativePath: rel });
          groups.set(stem, existing);
        }
      }
    }
  }

  // Create lessons for all groups that have videos
  const lessons: ScannedLesson[] = [];
  let fallbackOrder = 1;

  for (const [_, group] of groups.entries()) {
    if (!group.videoFile) continue;

    const { title, orderIndex } = cleanTitle(group.name);
    const lessonRelPath = `${moduleRelPath}/${group.videoFile}`;

    lessons.push({
      id: `lesson-${lessonRelPath}`,
      title,
      rawTitle: group.name,
      orderIndex: orderIndex !== 9999 ? orderIndex : fallbackOrder++,
      relativePath: lessonRelPath,
      coursePath: courseRelPath,
      modulePath: moduleRelPath,
      isVideo: true,
      isResourceOnly: false,
      durationSeconds: 0,
      subtitleFiles: group.subtitles,
      attachments: [...group.attachments],
    });
  }

  // Sort lessons by orderIndex, then naturally by name
  lessons.sort((a, b) => {
    if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex;
    return collator.compare(a.title, b.title);
  });

  // Match loose attachments and resource attachments
  const allAtts = [
    ...looseAttachments,
    ...subResources.map((r) => ({
      name: r.name,
      type: getAttachmentType(r.name),
      relativePath: r.relativePath,
      parentDirName: r.parentDirName,
    })),
  ];

  for (const att of allAtts) {
    const parentDir = 'parentDirName' in att ? (att as { parentDirName?: string }).parentDirName : undefined;
    const matched = matchAttachmentToLesson(att.name, parentDir, lessons);
    if (matched) {
      if (!matched.attachments.some((a) => a.name === att.name || a.relativePath === att.relativePath)) {
        matched.attachments.push({
          name: att.name,
          type: att.type,
          relativePath: att.relativePath,
        });
      }
    }
  }

  return lessons;
}

async function parseServerCourse(
  dirPath: string,
  folderName: string,
  relativePath: string,
  clusterId?: string,
  clusterName?: string
): Promise<ScannedCourse | null> {
  const { title: cleanCourseTitle } = cleanTitle(folderName);
  const items = await getDirItems(dirPath);

  // Look for cover image
  let coverUrl: string | undefined;
  for (const item of items) {
    if (!item.isDir && COVER_NAMES.has(item.name.toLowerCase())) {
      coverUrl = `/api/local/attachment?path=${encodeURIComponent(
        relativePath === '.' ? item.name : `${relativePath}/${item.name}`
      )}`;
      break;
    }
  }

  const subDirs = items.filter((i) => i.isDir && !i.name.startsWith('.'));
  const rootFiles = items.filter((i) => !i.isDir && !i.name.startsWith('.'));

  // Separate modules vs companion resource directories
  const moduleDirs: DiskItem[] = [];
  const resourceDirs: DiskItem[] = [];

  for (const s of subDirs) {
    if (isResourceDirectoryName(s.name)) {
      resourceDirs.push(s);
    } else {
      moduleDirs.push(s);
    }
  }

  // Collect course-level resources
  const courseResourceItems: ServerResourceItem[] = [];
  for (const rDir of resourceDirs) {
    const collected = await collectServerResourceFiles(
      rDir.fullPath,
      relativePath === '.' ? rDir.name : `${relativePath}/${rDir.name}`,
      rDir.name
    );
    courseResourceItems.push(...collected);
  }

  const modules: ScannedModule[] = [];

  // Parse curriculum modules
  if (moduleDirs.length > 0) {
    for (let i = 0; i < moduleDirs.length; i++) {
      const subDir = moduleDirs[i];
      const { title: modTitle, orderIndex } = cleanTitle(subDir.name);
      const modRelPath = relativePath === '.' ? subDir.name : `${relativePath}/${subDir.name}`;
      const lessons = await parseServerLessonsInDir(subDir.fullPath, modRelPath, relativePath);

      if (lessons.length > 0) {
        modules.push({
          id: `mod-${modRelPath}`,
          title: modTitle,
          rawTitle: subDir.name,
          orderIndex: orderIndex !== 9999 ? orderIndex : i + 1,
          relativePath: modRelPath,
          lessons,
        });
      }
    }
  }

  // Check for direct video lessons in course root
  if (rootFiles.some((f) => VIDEO_EXTENSIONS.has(getFileExtension(f.name)))) {
    const rootLessons = await parseServerLessonsInDir(dirPath, relativePath, relativePath);
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

  // Match course-level resource files across all lessons
  const allCourseLessons = modules.flatMap((m) => m.lessons);
  for (const item of courseResourceItems) {
    const matched = matchAttachmentToLesson(item.name, item.parentDirName, allCourseLessons);
    if (matched) {
      if (!matched.attachments.some((a) => a.name === item.name || a.relativePath === item.relativePath)) {
        matched.attachments.push({
          name: item.name,
          type: getAttachmentType(item.name),
          relativePath: item.relativePath,
        });
      }
    }
  }

  let totalLessons = 0;
  for (const m of modules) {
    totalLessons += m.lessons.length;
  }

  return {
    id: `course-${relativePath}`,
    title: cleanCourseTitle,
    rawTitle: folderName,
    relativePath,
    clusterId,
    clusterName,
    coverUrl,
    modules,
    totalLessons,
    totalDurationSeconds: 0,
  };
}

export async function scanServerDirectory(coursesDir: string): Promise<{
  courses: ScannedCourse[];
  clusters: ScannedCluster[];
  libraryState: CourseLibraryState | null;
}> {
  const rootItems = await getDirItems(coursesDir);
  const rootDirs = rootItems.filter((i) => i.isDir && !i.name.startsWith('.'));

  const scannedCourses: ScannedCourse[] = [];
  const scannedClusters: ScannedCluster[] = [];

  // Check for sidecar file courseplex.json in root
  let libraryState: CourseLibraryState | null = null;
  const sidecarPath = path.join(coursesDir, 'courseplex.json');
  if (fs.existsSync(sidecarPath)) {
    try {
      const raw = await fs.promises.readFile(sidecarPath, 'utf-8');
      libraryState = JSON.parse(raw);
    } catch (e) {
      console.warn('Could not parse courseplex.json sidecar:', e);
    }
  }

  for (const dirItem of rootDirs) {
    const subItems = await getDirItems(dirItem.fullPath);
    const hasDirectVideos = subItems.some(
      (e) => !e.isDir && VIDEO_EXTENSIONS.has(getFileExtension(e.name))
    );
    const subSubDirs = subItems.filter((e) => e.isDir && !e.name.startsWith('.'));

    let subDirsContainVideos = false;
    let subDirsAreCourses = false;

    for (const subSub of subSubDirs) {
      const subSubItems = await getDirItems(subSub.fullPath);
      if (subSubItems.some((e) => !e.isDir && VIDEO_EXTENSIONS.has(getFileExtension(e.name)))) {
        subDirsContainVideos = true;
      }
      const deeperDirs = subSubItems.filter((e) => e.isDir && !e.name.startsWith('.'));
      for (const deep of deeperDirs) {
        const deepItems = await getDirItems(deep.fullPath);
        if (deepItems.some((e) => !e.isDir && VIDEO_EXTENSIONS.has(getFileExtension(e.name)))) {
          subDirsAreCourses = true;
          break;
        }
      }
      if (subDirsAreCourses) break;
    }

    if (hasDirectVideos || (subDirsContainVideos && !subDirsAreCourses)) {
      // 2-Level hierarchy: dirItem is a Course
      const course = await parseServerCourse(
        dirItem.fullPath,
        dirItem.name,
        dirItem.name,
        undefined,
        undefined
      );
      if (course) scannedCourses.push(course);
    } else if (subSubDirs.length > 0) {
      // 3-Level hierarchy: dirItem is a Cluster/Track
      const clusterId = `cluster-${dirItem.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
      const { title: clusterTitle } = cleanTitle(dirItem.name);
      const clusterCoursePaths: string[] = [];

      for (const courseDir of subSubDirs) {
        const relPath = `${dirItem.name}/${courseDir.name}`;
        const course = await parseServerCourse(
          courseDir.fullPath,
          courseDir.name,
          relPath,
          clusterId,
          clusterTitle
        );
        if (course) {
          scannedCourses.push(course);
          clusterCoursePaths.push(relPath);
        }
      }

      if (clusterCoursePaths.length > 0) {
        scannedClusters.push({
          id: clusterId,
          name: clusterTitle,
          relativePath: dirItem.name,
          color: CLUSTER_COLORS[scannedClusters.length % CLUSTER_COLORS.length],
          coursePaths: clusterCoursePaths,
        });
      }
    }
  }

  // Also check if root folder itself directly contains a single course
  if (scannedCourses.length === 0) {
    const rootCourse = await parseServerCourse(
      coursesDir,
      path.basename(coursesDir) || 'Local Course',
      '_root_',
      undefined,
      undefined
    );
    if (rootCourse) scannedCourses.push(rootCourse);
  }

  // Recursive deep scan fallback: if shallow scans found 0 courses or 0 lessons,
  // walk all directory levels to discover and auto-organize all videos
  const totalLessonsFound = scannedCourses.reduce((acc, c) => acc + c.totalLessons, 0);
  if (scannedCourses.length === 0 || totalLessonsFound === 0) {
    console.log('[ServerScanner] Shallow scan found no playable lessons, running deep recursive scan on:', coursesDir);
    const deepResult = await deepScanServerCourses(coursesDir);
    if (deepResult.courses.length > 0) {
      scannedCourses.length = 0;
      scannedClusters.length = 0;
      scannedCourses.push(...deepResult.courses);
      scannedClusters.push(...deepResult.clusters);
    }
  }

  if (libraryState) {
    for (const course of scannedCourses) {
      let courseTotal = 0;
      for (const mod of course.modules) {
        for (const lesson of mod.lessons) {
          const cachedDur =
            libraryState.durations?.[lesson.relativePath] ||
            libraryState.progress?.[lesson.relativePath]?.durationSeconds ||
            0;
          if (cachedDur > 0) {
            lesson.durationSeconds = cachedDur;
          }
          courseTotal += lesson.durationSeconds || 0;
        }
      }
      course.totalDurationSeconds = courseTotal;
    }
  }

  return { courses: scannedCourses, clusters: scannedClusters, libraryState };
}

interface DiscoveredFile {
  name: string;
  ext: string;
  fullPath: string;
  dirPath: string;
  relPath: string;
  relDir: string;
}

async function collectAllFiles(
  currDir: string,
  relDir: string,
  depth = 0,
  maxDepth = 8
): Promise<DiscoveredFile[]> {
  if (depth > maxDepth) return [];
  const items = await getDirItems(currDir);
  const files: DiscoveredFile[] = [];

  for (const item of items) {
    if (item.name.startsWith('.')) continue;
    if (IGNORED_DIRECTORIES.has(item.name.toLowerCase())) continue;

    if (item.isDir) {
      // NOTE: Do not skip isResourceDirectoryName! Deep search checks all non-ignored folders.
      const nextRel = relDir ? `${relDir}/${item.name}` : item.name;
      const nested = await collectAllFiles(item.fullPath, nextRel, depth + 1, maxDepth);
      files.push(...nested);
    } else {
      const ext = getFileExtension(item.name);
      const relPath = relDir ? `${relDir}/${item.name}` : item.name;
      files.push({
        name: item.name,
        ext,
        fullPath: item.fullPath,
        dirPath: currDir,
        relPath,
        relDir: relDir || '.',
      });
    }
  }

  return files;
}

async function deepScanServerCourses(coursesDir: string): Promise<{
  courses: ScannedCourse[];
  clusters: ScannedCluster[];
}> {
  const allFiles = await collectAllFiles(coursesDir, '');
  const candidateVideos = allFiles.filter((f) => !f.name.endsWith('.d.ts') && VIDEO_EXTENSIONS.has(f.ext));
  const videoFiles: DiscoveredFile[] = [];
  for (const f of candidateVideos) {
    if (f.ext === 'ts') {
      if (await isMpegTsFile(f.fullPath)) {
        videoFiles.push(f);
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
    courseFullPath: string;
    modules: Map<string, {
      moduleKey: string;
      moduleTitle: string;
      orderIndex: number;
      moduleFullPath: string;
      videos: DiscoveredFile[];
    }>;
  }

  const courseMap = new Map<string, CourseBucket>();

  for (const v of videoFiles) {
    const parts = v.relDir === '.' ? [] : v.relDir.split(/[\\/]/).filter(Boolean);

    let courseKey = '_root_';
    let courseTitle = path.basename(coursesDir) || 'Local Course';
    let clusterId: string | undefined;
    let clusterName: string | undefined;
    let moduleKey = '_root_';
    let moduleTitle = 'Course Curriculum';
    let courseFullPath = coursesDir;
    let moduleFullPath = coursesDir;

    if (parts.length === 0) {
      // Direct video in root
      courseKey = '_root_';
      courseTitle = path.basename(coursesDir) || 'Local Course';
      moduleKey = '_root_';
      moduleTitle = 'Course Curriculum';
      courseFullPath = coursesDir;
      moduleFullPath = coursesDir;
    } else if (parts.length === 1) {
      // Course/video.mp4
      courseKey = parts[0];
      courseTitle = cleanTitle(parts[0]).title;
      moduleKey = parts[0];
      moduleTitle = 'Course Curriculum';
      courseFullPath = path.join(coursesDir, parts[0]);
      moduleFullPath = courseFullPath;
    } else if (parts.length === 2) {
      // Course/Module/video.mp4
      courseKey = parts[0];
      courseTitle = cleanTitle(parts[0]).title;
      moduleKey = `${parts[0]}/${parts[1]}`;
      moduleTitle = cleanTitle(parts[1]).title;
      courseFullPath = path.join(coursesDir, parts[0]);
      moduleFullPath = path.join(coursesDir, parts[0], parts[1]);
    } else if (parts.length === 3) {
      // Cluster/Course/Module/video.mp4 OR Course/Module/Videos/video.mp4
      const last = parts[2].toLowerCase();
      if (['videos', 'video', 'content', 'lectures', 'lessons', 'media'].includes(last)) {
        courseKey = parts[0];
        courseTitle = cleanTitle(parts[0]).title;
        moduleKey = `${parts[0]}/${parts[1]}`;
        moduleTitle = cleanTitle(parts[1]).title;
        courseFullPath = path.join(coursesDir, parts[0]);
        moduleFullPath = path.join(coursesDir, parts[0], parts[1]);
      } else {
        clusterId = `cluster-${parts[0].toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        clusterName = cleanTitle(parts[0]).title;
        courseKey = `${parts[0]}/${parts[1]}`;
        courseTitle = cleanTitle(parts[1]).title;
        moduleKey = `${parts[0]}/${parts[1]}/${parts[2]}`;
        moduleTitle = cleanTitle(parts[2]).title;
        courseFullPath = path.join(coursesDir, parts[0], parts[1]);
        moduleFullPath = path.join(coursesDir, parts[0], parts[1], parts[2]);
      }
    } else {
      // parts.length >= 4: e.g. Category/Subcategory/Course/Module/video.mp4
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
      courseFullPath = path.join(coursesDir, ...parts.slice(0, courseIdx + 1));
      moduleFullPath = path.join(coursesDir, ...parts.slice(0, modIdx + 1));
    }

    let bucket = courseMap.get(courseKey);
    if (!bucket) {
      bucket = {
        courseKey,
        courseTitle,
        clusterId,
        clusterName,
        courseFullPath,
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
        moduleFullPath,
        videos: [],
      };
      bucket.modules.set(moduleKey, modBucket);
    }

    modBucket.videos.push(v);
  }

  const courses: ScannedCourse[] = [];
  const clusterMap = new Map<string, { id: string; name: string; coursePaths: string[] }>();

  for (const bucket of courseMap.values()) {
    let coverUrl: string | undefined;
    try {
      const dirEntries = await fs.promises.readdir(bucket.courseFullPath);
      for (const f of dirEntries) {
        if (COVER_NAMES.has(f.toLowerCase())) {
          coverUrl = `/api/local/attachment?path=${encodeURIComponent(
            bucket.courseKey === '.' || bucket.courseKey === '_root_' ? f : `${bucket.courseKey}/${f}`
          )}`;
          break;
        }
      }
    } catch {
      // ignore
    }

    const courseModules: ScannedModule[] = [];
    let modFallbackOrder = 1;

    for (const mod of bucket.modules.values()) {
      let moduleDirFiles: string[] = [];
      try {
        moduleDirFiles = await fs.promises.readdir(mod.moduleFullPath);
      } catch {
        // ignore
      }

      const subtitles = moduleDirFiles
        .filter((f) => SUBTITLE_EXTENSIONS.has(getFileExtension(f)))
        .map((f) => {
          const langMatch = f.match(/\.(en|es|fr|de|pt|ru|zh|ja|ko)\.(srt|vtt)$/i);
          const lang = langMatch ? langMatch[1].toLowerCase() : 'en';
          return {
            name: f,
            lang,
            relativePath: `${mod.moduleKey}/${f}`,
          };
        });

      const lessons: ScannedLesson[] = [];
      let lesFallbackOrder = 1;

      for (const v of mod.videos) {
        const { title, orderIndex } = cleanTitle(v.name);
        const vStem = v.name.replace(/\.[a-zA-Z0-9]+$/, '').toLowerCase().trim();

        const matchedSubs = subtitles.filter((s) => {
          const sStem = s.name.replace(/\.(en|es|fr|de|pt|ru|zh|ja|ko)?\.[a-zA-Z0-9]+$/, '').toLowerCase().trim();
          return sStem === vStem || sStem.includes(vStem) || vStem.includes(sStem);
        });

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
        modules: courseModules,
        totalLessons,
        totalDurationSeconds: 0,
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

  // Ultimate fallback: if videoFiles were discovered on disk but bucket/module grouping yielded 0 courses,
  // ensure they are never lost: build a single course containing all discovered videos.
  if (courses.length === 0 && videoFiles.length > 0) {
    const fallbackLessons: ScannedLesson[] = videoFiles.map((v, idx) => {
      const { title, orderIndex } = cleanTitle(v.name);
      return {
        id: `lesson-${v.relPath}`,
        title,
        rawTitle: v.name,
        orderIndex: orderIndex !== 9999 ? orderIndex : idx + 1,
        relativePath: v.relPath,
        coursePath: '_root_',
        modulePath: '_root_',
        isVideo: true,
        isResourceOnly: false,
        durationSeconds: 0,
        attachments: [],
      };
    });

    fallbackLessons.sort((a, b) => {
      if (a.orderIndex !== b.orderIndex) return a.orderIndex - b.orderIndex;
      return collator.compare(a.title, b.title);
    });

    const fallbackCourseTitle = path.basename(coursesDir) || 'Local Course';
    courses.push({
      id: 'course-root',
      title: fallbackCourseTitle,
      rawTitle: fallbackCourseTitle,
      relativePath: '_root_',
      modules: [
        {
          id: 'mod-root',
          title: 'Course Curriculum',
          rawTitle: 'Course Curriculum',
          orderIndex: 1,
          relativePath: '_root_',
          lessons: fallbackLessons,
        },
      ],
      totalLessons: fallbackLessons.length,
      totalDurationSeconds: 0,
    });
  }

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
