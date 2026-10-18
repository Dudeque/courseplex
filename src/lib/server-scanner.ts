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

const VIDEO_EXTENSIONS = new Set(['mp4', 'mkv', 'webm', 'mov', 'm4v']);
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
    const items: DiskItem[] = entries.map((e) => ({
      name: e.name,
      isDir: e.isDirectory(),
      fullPath: path.join(dirPath, e.name),
    }));
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

    if (VIDEO_EXTENSIONS.has(ext)) {
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
      '.',
      undefined,
      undefined
    );
    if (rootCourse) scannedCourses.push(rootCourse);
  }

  return { courses: scannedCourses, clusters: scannedClusters, libraryState };
}
