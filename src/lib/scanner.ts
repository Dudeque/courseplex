import {
  ScannedCourse,
  ScannedModule,
  ScannedLesson,
  ScannedAttachment,
  ScannedCluster,
} from '@/types/course';

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const VIDEO_EXTENSIONS = new Set(['mp4', 'mkv', 'webm', 'mov', 'm4v']);
const SUBTITLE_EXTENSIONS = new Set(['srt', 'vtt']);
const NOTE_EXTENSIONS = new Set(['md', 'txt', 'html']);
const ATTACHMENT_EXTENSIONS = new Set(['pdf', 'zip', 'ipynb', 'py', 'js', 'ts', 'jsx', 'tsx', 'tar', 'gz', 'json']);
const COVER_NAMES = new Set([
  'cover.jpg', 'cover.jpeg', 'cover.png', 'cover.webp',
  'poster.jpg', 'poster.jpeg', 'poster.png', 'poster.webp',
  'folder.jpg', 'folder.jpeg', 'folder.png', 'folder.webp',
]);

const CLUSTER_COLORS = [
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

/**
 * Scan directory using FileSystemDirectoryHandle (Chrome, Edge, Opera, Arc)
 */
export async function scanFileSystemDirectory(
  rootDirHandle: FileSystemDirectoryHandle,
  onProgress?: (status: string) => void
): Promise<{ courses: ScannedCourse[]; clusters: ScannedCluster[] }> {
  onProgress?.('Reading root directory contents...');

  interface DirItem {
    name: string;
    handle: FileSystemHandle;
    isDir: boolean;
  }

  async function getEntries(dirHandle: FileSystemDirectoryHandle): Promise<DirItem[]> {
    const items: DirItem[] = [];
    const dirWithEntries = dirHandle as unknown as { entries: () => AsyncIterable<[string, FileSystemHandle]> };
    if (typeof dirWithEntries.entries === 'function') {
      for await (const [name, handle] of dirWithEntries.entries()) {
        items.push({ name, handle, isDir: handle.kind === 'directory' });
      }
    } else {
      const dirWithValues = dirHandle as unknown as { values: () => AsyncIterable<FileSystemHandle> };
      for await (const handle of dirWithValues.values()) {
        items.push({ name: handle.name, handle, isDir: handle.kind === 'directory' });
      }
    }
    return items.sort((a, b) => collator.compare(a.name, b.name));
  }

  const rootEntries = await getEntries(rootDirHandle);
  const rootDirs = rootEntries.filter((e) => e.isDir);

  const scannedCourses: ScannedCourse[] = [];
  const scannedClusters: ScannedCluster[] = [];

  // Determine whether top-level folders are Clusters or Courses
  for (let i = 0; i < rootDirs.length; i++) {
    const dirEntry = rootDirs[i];
    // Skip hidden folders (.git, .courseplex, etc.)
    if (dirEntry.name.startsWith('.')) continue;

    onProgress?.(`Inspecting ${dirEntry.name}...`);
    const subHandle = dirEntry.handle as FileSystemDirectoryHandle;
    const subEntries = await getEntries(subHandle);

    const hasDirectVideos = subEntries.some(
      (e) => !e.isDir && VIDEO_EXTENSIONS.has(getFileExtension(e.name))
    );
    const subSubDirs = subEntries.filter((e) => e.isDir && !e.name.startsWith('.'));

    // Check if subdirectories have videos (meaning subDirs are Modules -> this folder is a Course)
    let subDirsContainVideos = false;
    let subDirsAreCourses = false;

    for (const subSub of subSubDirs.slice(0, 5)) {
      const subSubEntries = await getEntries(subSub.handle as FileSystemDirectoryHandle);
      const subSubHasVideos = subSubEntries.some(
        (e) => !e.isDir && VIDEO_EXTENSIONS.has(getFileExtension(e.name))
      );
      if (subSubHasVideos) {
        subDirsContainVideos = true;
      }
      const deeperDirs = subSubEntries.filter((e) => e.isDir && !e.name.startsWith('.'));
      if (deeperDirs.length > 0) {
        subDirsAreCourses = true;
      }
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

  // Also check if root folder itself directly contains videos/modules (1-course library)
  const rootDirectVideos = rootEntries.filter(
    (e) => !e.isDir && VIDEO_EXTENSIONS.has(getFileExtension(e.name))
  );
  if (scannedCourses.length === 0 && rootDirectVideos.length > 0) {
    const course = await parseCourseDirectory(
      rootDirHandle,
      rootDirHandle.name || 'Local Course',
      '.',
      undefined,
      undefined
    );
    if (course) scannedCourses.push(course);
  }

  return { courses: scannedCourses, clusters: scannedClusters };
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

  const modules: ScannedModule[] = [];

  // If there are subdirectories that contain video files, parse them as Modules
  if (subDirs.length > 0) {
    for (let i = 0; i < subDirs.length; i++) {
      const subDir = subDirs[i];
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

  entries.sort((a, b) => collator.compare(a.name, b.name));
  return parseLessonsFromEntries(entries, modulePath, coursePath);
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

    if (VIDEO_EXTENSIONS.has(ext)) {
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
        const ext = getFileExtension(att.name);
        const type = ext === 'pdf' ? 'pdf' : ext === 'zip' ? 'zip' : 'code';
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

  for (const loose of looseResourceEntries) {
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
export function scanFileList(
  fileList: FileList | File[],
  onProgress?: (status: string) => void
): { courses: ScannedCourse[]; clusters: ScannedCluster[] } {
  onProgress?.('Parsing dropped course files...');
  const files = Array.from(fileList);

  interface PathNode {
    file?: File;
    children: Map<string, PathNode>;
  }

  const root: PathNode = { children: new Map() };

  for (const file of files) {
    const relativePath = file.webkitRelativePath || file.name;
    const parts = relativePath.split('/');
    let curr = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!curr.children.has(part)) {
        curr.children.set(part, { children: new Map() });
      }
      curr = curr.children.get(part)!;
      if (i === parts.length - 1) {
        curr.file = file;
      }
    }
  }

  // Build ScannedCourses from file tree
  const courses: ScannedCourse[] = [];
  const clusters: ScannedCluster[] = [];

  for (const [topName, topNode] of root.children.entries()) {
    if (topName.startsWith('.')) continue;

    // Check if top level is course or cluster
    const containsSubDirs = Array.from(topNode.children.values()).some((n) => n.children.size > 0);
    const directVideos = Array.from(topNode.children.values()).filter(
      (n) => n.file && VIDEO_EXTENSIONS.has(getFileExtension(n.file.name))
    );

    if (directVideos.length > 0 || !containsSubDirs) {
      const course = parseCourseFromNode(topNode, topName, topName);
      if (course) courses.push(course);
    } else {
      // Cluster
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

  return { courses, clusters };
}

function parseCourseFromNode(
  node: { file?: File; children: Map<string, { file?: File; children: Map<string, unknown> }> },
  courseName: string,
  relativePath: string,
  clusterId?: string,
  clusterName?: string
): ScannedCourse | null {
  const { title: cleanCourseTitle } = cleanTitle(courseName);
  let coverUrl: string | undefined;

  for (const [name, child] of node.children.entries()) {
    if (child.file && COVER_NAMES.has(name.toLowerCase())) {
      coverUrl = URL.createObjectURL(child.file);
      break;
    }
  }

  const modules: ScannedModule[] = [];
  let modIndex = 1;

  for (const [name, child] of node.children.entries()) {
    if (child.children.size > 0) {
      const { title: modTitle } = cleanTitle(name);
      const lessons: ScannedLesson[] = [];
      const modPath = `${relativePath}/${name}`;

      for (const [fileName, fileNode] of child.children.entries()) {
        const file = (fileNode as { file?: File }).file;
        if (!file) continue;
        const ext = getFileExtension(fileName);
        if (VIDEO_EXTENSIONS.has(ext)) {
          const { title: lesTitle, orderIndex } = cleanTitle(fileName);
          const lesPath = `${modPath}/${fileName}`;
          lessons.push({
            id: `les-${lesPath}`,
            title: lesTitle,
            rawTitle: fileName,
            orderIndex,
            relativePath: lesPath,
            coursePath: relativePath,
            modulePath: modPath,
            isVideo: true,
            isResourceOnly: false,
            durationSeconds: 0,
            videoFile: file,
            attachments: [],
          });
        }
      }

      if (lessons.length > 0) {
        lessons.sort((a, b) => a.orderIndex - b.orderIndex || collator.compare(a.title, b.title));
        modules.push({
          id: `mod-${modPath}`,
          title: modTitle,
          rawTitle: name,
          orderIndex: modIndex++,
          relativePath: modPath,
          lessons,
        });
      }
    }
  }

  if (modules.length === 0) return null;

  return {
    id: `course-${relativePath}`,
    title: cleanCourseTitle,
    rawTitle: courseName,
    relativePath,
    clusterId,
    clusterName,
    coverUrl,
    modules,
    totalLessons: modules.reduce((acc, m) => acc + m.lessons.length, 0),
    totalDurationSeconds: 0,
  };
}
