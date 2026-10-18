import { create } from 'zustand';
import {
  CourseLibraryState,
  ScannedCourse,
  ScannedCluster,
  ScannedLesson,
  LessonNote,
  LessonProgress,
} from '@/types/course';
import { get as getIdb, set as setIdb, del as delIdb } from 'idb-keyval';
import {
  getSavedRootDirectory,
  pickAndSaveRootDirectory,
  requestRootPermission,
  clearSavedRootDirectory,
  triggerMountDirectory,
  getFileHandleByPath,
  ROOT_HANDLE_NAME_KEY,
  LIBRARY_STATE_CACHE_KEY,
  SCANNED_COURSES_CACHE_KEY,
  SCANNED_CLUSTERS_CACHE_KEY,
} from '@/lib/fs-handle';
import {
  createDefaultLibraryState,
  readStateFromDisk,
  writeStateToDisk,
  writeCourseNotesToDisk,
} from '@/lib/disk-sync';
import { scanFileSystemDirectory, scanFileList } from '@/lib/scanner';
import { durationHydrator } from '@/lib/duration-hydrator';
import { createDemoLibraryState, createDemoScannedData } from '@/lib/demo-data';

interface CourseStoreState {
  rootDirHandle: FileSystemDirectoryHandle | null;
  rootDirName: string | null;
  permissionGranted: boolean;
  isDemoMode: boolean;
  isScanning: boolean;
  scanStatus: string;
  isInitialized: boolean;

  libraryState: CourseLibraryState;
  scannedCourses: ScannedCourse[];
  scannedClusters: ScannedCluster[];

  activeCourse: ScannedCourse | null;
  activeLesson: ScannedLesson | null;
  activeVideoUrl: string | null;
  activeSubtitleUrl: string | null;

  playbackSpeed: number;
  isTheaterMode: boolean;
  searchQuery: string;
  filterCluster: string | null;
  filterStatus: 'all' | 'in_progress' | 'completed' | 'not_started' | 'favorites';
  sortBy: 'recent' | 'title' | 'progress' | 'duration';

  // Actions
  init: () => Promise<void>;
  connectDirectory: () => Promise<void>;
  reconnectDirectory: () => Promise<void>;
  disconnectDirectory: () => Promise<void>;
  rescanDirectory: () => Promise<void>;
  loadDemoMode: () => void;
  scanFromInputFiles: (files: FileList | File[]) => Promise<void>;

  selectCourse: (coursePath: string) => void;
  selectLesson: (lesson: ScannedLesson) => Promise<void>;
  clearActiveLessonMedia: () => void;

  updateLessonProgress: (
    coursePath: string,
    lessonPath: string,
    currentTime: number,
    duration: number,
    completed?: boolean
  ) => void;
  toggleLessonCompleted: (coursePath: string, lessonPath: string) => void;

  addOrUpdateNote: (note: Omit<LessonNote, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void;
  deleteNote: (noteId: string, lessonPath: string) => void;

  toggleFavoriteCourse: (coursePath: string) => void;
  setCourseCluster: (coursePath: string, clusterId: string) => void;
  createCluster: (name: string, color: string, description?: string) => string;

  setPlaybackSpeed: (speed: number) => void;
  setTheaterMode: (theater: boolean) => void;
  toggleTheaterMode: () => void;
  setSearchQuery: (query: string) => void;
  setFilterCluster: (clusterId: string | null) => void;
  setFilterStatus: (status: 'all' | 'in_progress' | 'completed' | 'not_started' | 'favorites') => void;
  setSortBy: (sort: 'recent' | 'title' | 'progress' | 'duration') => void;

  logStudySession: (coursePath: string, lessonPath: string, realMinutes: number, contentMinutes: number) => void;
  setDailyGoalMinutes: (minutes: number) => void;
  exportCourseNotes: (coursePath: string) => Promise<string>;
}

let syncTimeout: NodeJS.Timeout | null = null;

function serializeCoursesForCache(courses: ScannedCourse[]): ScannedCourse[] {
  return courses.map((course) => ({
    id: course.id,
    title: course.title,
    rawTitle: course.rawTitle,
    relativePath: course.relativePath,
    clusterId: course.clusterId,
    clusterName: course.clusterName,
    modules: course.modules.map((mod) => ({
      id: mod.id,
      title: mod.title,
      rawTitle: mod.rawTitle,
      orderIndex: mod.orderIndex,
      relativePath: mod.relativePath,
      lessons: mod.lessons.map((les) => ({
        id: les.id,
        title: les.title,
        rawTitle: les.rawTitle,
        orderIndex: les.orderIndex,
        relativePath: les.relativePath,
        coursePath: les.coursePath,
        modulePath: les.modulePath,
        isVideo: les.isVideo,
        isResourceOnly: les.isResourceOnly,
        durationSeconds: les.durationSeconds,
        attachments: les.attachments.map((att) => ({
          name: att.name,
          type: att.type,
          relativePath: att.relativePath,
        })),
        subtitleFiles: les.subtitleFiles?.map((sub) => ({
          name: sub.name,
          lang: sub.lang,
        })),
      })),
    })),
    totalLessons: course.totalLessons,
    totalDurationSeconds: course.totalDurationSeconds,
  }));
}

function scheduleDiskSync(
  rootDirHandle: FileSystemDirectoryHandle | null,
  state: CourseLibraryState,
  isDemoMode: boolean
) {
  if (isDemoMode) return;
  // Always persist state immediately to IndexedDB
  setIdb(LIBRARY_STATE_CACHE_KEY, state).catch((e) =>
    console.warn('Background IDB cache error:', e)
  );

  if (!rootDirHandle) return;
  if (syncTimeout) clearTimeout(syncTimeout);

  syncTimeout = setTimeout(async () => {
    try {
      await writeStateToDisk(rootDirHandle, state);
    } catch (err) {
      console.warn('Background disk sync error:', err);
    }
  }, 2000);
}

export const useCourseStore = create<CourseStoreState>((set, get) => ({
  rootDirHandle: null,
  rootDirName: null,
  permissionGranted: false,
  isDemoMode: false,
  isScanning: false,
  scanStatus: '',
  isInitialized: false,

  libraryState: createDefaultLibraryState(),
  scannedCourses: [],
  scannedClusters: [],

  activeCourse: null,
  activeLesson: null,
  activeVideoUrl: null,
  activeSubtitleUrl: null,

  playbackSpeed: 1,
  isTheaterMode: false,
  searchQuery: '',
  filterCluster: null,
  filterStatus: 'all',
  sortBy: 'recent',

  init: async () => {
    if (get().isInitialized) return;

    if (typeof window !== 'undefined') {
      const savedSpeed = localStorage.getItem('courseplex_playback_speed');
      if (savedSpeed) {
        const parsed = parseFloat(savedSpeed);
        if (!isNaN(parsed) && parsed >= 0.5 && parsed <= 3) {
          set({ playbackSpeed: parsed });
        }
      }
    }

    // 1. Restore cached state & course metadata from IndexedDB
    try {
      const cachedState = await getIdb<CourseLibraryState>(LIBRARY_STATE_CACHE_KEY);
      const cachedCourses = await getIdb<ScannedCourse[]>(SCANNED_COURSES_CACHE_KEY);
      const cachedClusters = await getIdb<ScannedCluster[]>(SCANNED_CLUSTERS_CACHE_KEY);
      const savedName = await getIdb<string>(ROOT_HANDLE_NAME_KEY);

      if (cachedCourses && cachedCourses.length > 0) {
        set({
          scannedCourses: cachedCourses,
          scannedClusters: cachedClusters || [],
          libraryState: cachedState || createDefaultLibraryState(),
          rootDirName: savedName || 'Local Courses',
        });
      } else if (cachedState) {
        set({ libraryState: cachedState });
      }
    } catch (err) {
      console.warn('Could not restore cached library from IndexedDB:', err);
    }

    // 2. Check for FileSystemDirectoryHandle and query its permission
    try {
      const { handle, name, permissionState } = await getSavedRootDirectory();
      if (handle) {
        set({
          rootDirHandle: handle,
          rootDirName: name || handle.name,
          permissionGranted: permissionState === 'granted',
          isInitialized: true,
        });

        if (permissionState === 'granted') {
          // Rescan silently in background to refresh live File handles
          get().rescanDirectory().catch((e) => console.warn('Background rescan error:', e));
        }
        return;
      }
    } catch (e) {
      console.warn('Initialization handle check error:', e);
    }

    set({ isInitialized: true });
  },

  connectDirectory: async () => {
    try {
      set({ isScanning: true, scanStatus: 'Selecting folder...' });
      const handle = await pickAndSaveRootDirectory();
      set({
        rootDirHandle: handle,
        rootDirName: handle.name,
        permissionGranted: true,
        isDemoMode: false,
      });

      // Try reading sidecar
      let diskState = await readStateFromDisk(handle);
      if (!diskState) {
        diskState = createDefaultLibraryState();
        try {
          await writeStateToDisk(handle, diskState);
        } catch (e) {
          console.warn('Could not initialize sidecar file on disk:', e);
        }
      }

      set({ libraryState: diskState });

      // Scan directory
      set({ scanStatus: 'Scanning courses and modules...' });
      const { courses, clusters } = await scanFileSystemDirectory(handle, (status) => {
        set({ scanStatus: status });
      });

      set({
        scannedCourses: courses,
        scannedClusters: clusters,
        isScanning: false,
        scanStatus: '',
      });

      // Cache metadata in IndexedDB
      await setIdb(SCANNED_COURSES_CACHE_KEY, serializeCoursesForCache(courses));
      await setIdb(SCANNED_CLUSTERS_CACHE_KEY, clusters);
      await setIdb(LIBRARY_STATE_CACHE_KEY, diskState);
      await setIdb(ROOT_HANDLE_NAME_KEY, handle.name);

      // Hydrate durations in background
      for (const course of courses) {
        for (const mod of course.modules) {
          for (const lesson of mod.lessons) {
            if (lesson.videoFile && lesson.durationSeconds === 0) {
              const file = lesson.videoFile;
              const rel = lesson.relativePath;
              durationHydrator.getCachedDuration(rel, file).then((cached) => {
                if (cached) {
                  lesson.durationSeconds = cached;
                  set((s) => ({ scannedCourses: [...s.scannedCourses] }));
                } else {
                  durationHydrator.enqueue({
                    relativePath: rel,
                    file,
                    onResolved: (dur) => {
                      lesson.durationSeconds = dur;
                      set((s) => ({ scannedCourses: [...s.scannedCourses] }));
                    },
                  });
                }
              });
            }
          }
        }
      }
    } catch (err) {
      set({ isScanning: false, scanStatus: '' });
      throw err;
    }
  },

  reconnectDirectory: async () => {
    const handle = get().rootDirHandle;
    if (!handle) {
      await get().connectDirectory();
      return;
    }

    set({ isScanning: true, scanStatus: 'Requesting permission...' });
    const granted = await requestRootPermission(handle);
    if (granted) {
      set({ permissionGranted: true });
      await get().rescanDirectory();
    } else {
      set({ permissionGranted: false, isScanning: false, scanStatus: '' });
    }
  },

  disconnectDirectory: async () => {
    await clearSavedRootDirectory();
    await delIdb(SCANNED_COURSES_CACHE_KEY);
    await delIdb(SCANNED_CLUSTERS_CACHE_KEY);
    await delIdb(LIBRARY_STATE_CACHE_KEY);
    set({
      rootDirHandle: null,
      rootDirName: null,
      permissionGranted: false,
      isDemoMode: false,
      scannedCourses: [],
      scannedClusters: [],
      activeCourse: null,
      activeLesson: null,
      activeVideoUrl: null,
      activeSubtitleUrl: null,
      libraryState: createDefaultLibraryState(),
    });
  },

  rescanDirectory: async () => {
    const handle = get().rootDirHandle;
    if (!handle) return;

    set({ isScanning: true, scanStatus: 'Rescanning folder...' });
    try {
      const diskState = await readStateFromDisk(handle);
      if (diskState) {
        set({ libraryState: diskState });
      }

      const { courses, clusters } = await scanFileSystemDirectory(handle, (status) => {
        set({ scanStatus: status });
      });

      set({
        scannedCourses: courses,
        scannedClusters: clusters,
        isScanning: false,
        scanStatus: '',
        isDemoMode: false,
      });

      // Update IDB caches
      await setIdb(SCANNED_COURSES_CACHE_KEY, serializeCoursesForCache(courses));
      await setIdb(SCANNED_CLUSTERS_CACHE_KEY, clusters);
      await setIdb(LIBRARY_STATE_CACHE_KEY, get().libraryState);

      // Hydrate durations
      for (const course of courses) {
        for (const mod of course.modules) {
          for (const lesson of mod.lessons) {
            if (lesson.videoFile && lesson.durationSeconds === 0) {
              const file = lesson.videoFile;
              const rel = lesson.relativePath;
              durationHydrator.getCachedDuration(rel, file).then((cached) => {
                if (cached) {
                  lesson.durationSeconds = cached;
                  set((s) => ({ scannedCourses: [...s.scannedCourses] }));
                } else {
                  durationHydrator.enqueue({
                    relativePath: rel,
                    file,
                    onResolved: (dur) => {
                      lesson.durationSeconds = dur;
                      set((s) => ({ scannedCourses: [...s.scannedCourses] }));
                    },
                  });
                }
              });
            }
          }
        }
      }
    } catch (e) {
      console.error('Rescan failed:', e);
      set({ isScanning: false, scanStatus: '' });
    }
  },

  loadDemoMode: () => {
    const demoState = createDemoLibraryState();
    const { courses, clusters } = createDemoScannedData();
    set({
      rootDirHandle: null,
      rootDirName: 'CoursePlex Demo Collection (Local Mock)',
      permissionGranted: true,
      isDemoMode: true,
      libraryState: demoState,
      scannedCourses: courses,
      scannedClusters: clusters,
      isScanning: false,
      scanStatus: '',
    });
  },

  scanFromInputFiles: async (files: FileList | File[]) => {
    set({ isScanning: true, scanStatus: 'Parsing files...' });
    const fileArray = Array.from(files);
    let inferredDirName = 'Local Course Folder';
    for (const f of fileArray) {
      if (f.webkitRelativePath) {
        const parts = f.webkitRelativePath.split('/');
        if (parts.length > 1) {
          inferredDirName = parts[0];
          break;
        }
      }
    }

    const { courses, clusters, sidecarState } = await scanFileList(files, (status) => {
      set({ scanStatus: status });
    });

    let currentLibState = get().libraryState;
    if (sidecarState) {
      currentLibState = {
        ...currentLibState,
        ...sidecarState,
      };
    }

    set({
      rootDirHandle: null,
      rootDirName: inferredDirName,
      permissionGranted: true,
      isDemoMode: false,
      scannedCourses: courses,
      scannedClusters: clusters,
      libraryState: currentLibState,
      isScanning: false,
      scanStatus: '',
    });

    // Cache in IndexedDB for instant persistence across reloads
    await setIdb(SCANNED_COURSES_CACHE_KEY, serializeCoursesForCache(courses));
    await setIdb(SCANNED_CLUSTERS_CACHE_KEY, clusters);
    await setIdb(LIBRARY_STATE_CACHE_KEY, currentLibState);
    await setIdb(ROOT_HANDLE_NAME_KEY, inferredDirName);

    // Hydrate durations
    for (const course of courses) {
      for (const mod of course.modules) {
        for (const lesson of mod.lessons) {
          if (lesson.videoFile && lesson.durationSeconds === 0) {
            const file = lesson.videoFile;
            const rel = lesson.relativePath;
            durationHydrator.getCachedDuration(rel, file).then((cached) => {
              if (cached) {
                lesson.durationSeconds = cached;
                set((s) => ({ scannedCourses: [...s.scannedCourses] }));
              } else {
                durationHydrator.enqueue({
                  relativePath: rel,
                  file,
                  onResolved: (dur) => {
                    lesson.durationSeconds = dur;
                    set((s) => ({ scannedCourses: [...s.scannedCourses] }));
                  },
                });
              }
            });
          }
        }
      }
    }
  },

  selectCourse: (coursePath: string) => {
    const course = get().scannedCourses.find((c) => c.relativePath === coursePath);
    if (!course) return;

    set({ activeCourse: course });

    // Mark course as in_progress if not started
    const currentMeta = get().libraryState.courses[coursePath] || {
      coursePath,
      clusterIds: course.clusterId ? [course.clusterId] : [],
      tags: [],
      isFavorite: false,
      isArchived: false,
      status: 'not_started',
    };

    const updatedState: CourseLibraryState = {
      ...get().libraryState,
      courses: {
        ...get().libraryState.courses,
        [coursePath]: {
          ...currentMeta,
          status: currentMeta.status === 'not_started' ? 'in_progress' : currentMeta.status,
          lastAccessedAt: new Date().toISOString(),
        },
      },
    };

    set({ libraryState: updatedState });
    scheduleDiskSync(get().rootDirHandle, updatedState, get().isDemoMode);
  },

  selectLesson: async (lesson: ScannedLesson) => {
    get().clearActiveLessonMedia();

    let videoUrl: string | null = null;
    let subtitleUrl: string | null = null;

    if (lesson.videoFile) {
      videoUrl = URL.createObjectURL(lesson.videoFile);
    } else if (get().isDemoMode) {
      // Demo mock video
      videoUrl = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
    } else if (get().rootDirHandle) {
      // Reloaded page with FileSystemDirectoryHandle: resolve file on demand
      try {
        const rootHandle = get().rootDirHandle!;
        if (!get().permissionGranted) {
          await get().reconnectDirectory();
        }
        const fileHandle = await getFileHandleByPath(rootHandle, lesson.relativePath);
        if (fileHandle) {
          const file = await fileHandle.getFile();
          lesson.videoFile = file;
          lesson.videoHandle = fileHandle;
          videoUrl = URL.createObjectURL(file);
        }
      } catch (err) {
        console.warn('Could not re-fetch video file handle on demand:', err);
      }
    } else {
      // Reloaded page in file input fallback mode: prompt user to re-mount folder
      await triggerMountDirectory();
    }

    if (lesson.subtitleFiles && lesson.subtitleFiles.length > 0) {
      const primarySub = lesson.subtitleFiles[0];
      if (primarySub.file) {
        const { createVttBlobUrlFromSrtFile } = await import('@/lib/subtitles');
        subtitleUrl = await createVttBlobUrlFromSrtFile(primarySub.file);
      } else if (primarySub.handle) {
        try {
          const file = await primarySub.handle.getFile();
          const { createVttBlobUrlFromSrtFile } = await import('@/lib/subtitles');
          subtitleUrl = await createVttBlobUrlFromSrtFile(file);
        } catch (e) {
          console.warn('Could not read subtitle file handle:', e);
        }
      }
    }

    set({
      activeLesson: lesson,
      activeVideoUrl: videoUrl,
      activeSubtitleUrl: subtitleUrl,
    });

    // Update last watched lesson on course
    const coursePath = lesson.coursePath;
    const currentMeta = get().libraryState.courses[coursePath] || {
      coursePath,
      clusterIds: [],
      tags: [],
      isFavorite: false,
      isArchived: false,
      status: 'in_progress',
    };

    const updatedState: CourseLibraryState = {
      ...get().libraryState,
      courses: {
        ...get().libraryState.courses,
        [coursePath]: {
          ...currentMeta,
          lastAccessedAt: new Date().toISOString(),
          lastWatchedLessonPath: lesson.relativePath,
        },
      },
    };

    set({ libraryState: updatedState });
    scheduleDiskSync(get().rootDirHandle, updatedState, get().isDemoMode);
  },

  clearActiveLessonMedia: () => {
    const { activeVideoUrl, activeSubtitleUrl } = get();
    if (activeVideoUrl && activeVideoUrl.startsWith('blob:')) {
      URL.revokeObjectURL(activeVideoUrl);
    }
    if (activeSubtitleUrl && activeSubtitleUrl.startsWith('blob:')) {
      URL.revokeObjectURL(activeSubtitleUrl);
    }
    set({ activeVideoUrl: null, activeSubtitleUrl: null });
  },

  updateLessonProgress: (
    coursePath: string,
    lessonPath: string,
    currentTime: number,
    duration: number,
    completed?: boolean
  ) => {
    const existing = get().libraryState.progress[lessonPath];
    const isCompleted = completed !== undefined ? completed : (duration > 0 && currentTime / duration >= 0.9);

    const progressItem: LessonProgress = {
      lessonPath,
      coursePath,
      currentTimeSeconds: Math.round(currentTime),
      durationSeconds: Math.round(duration || existing?.durationSeconds || 0),
      completed: isCompleted || (existing?.completed ?? false),
      completedAt: isCompleted ? (existing?.completedAt || new Date().toISOString()) : existing?.completedAt,
      watchCount: (existing?.watchCount || 0) + (currentTime > 5 && (!existing || existing.currentTimeSeconds < 5) ? 1 : 0),
      lastWatchedAt: new Date().toISOString(),
    };

    // Check if whole course is completed
    const course = get().scannedCourses.find((c) => c.relativePath === coursePath);
    let allCourseLessonsCompleted = false;
    if (course && course.totalLessons > 0) {
      let completedCount = 0;
      for (const mod of course.modules) {
        for (const les of mod.lessons) {
          if (les.relativePath === lessonPath ? isCompleted : get().libraryState.progress[les.relativePath]?.completed) {
            completedCount++;
          }
        }
      }
      allCourseLessonsCompleted = completedCount >= course.totalLessons;
    }

    const currentMeta = get().libraryState.courses[coursePath] || {
      coursePath,
      clusterIds: [],
      tags: [],
      isFavorite: false,
      isArchived: false,
      status: 'in_progress',
    };

    const updatedState: CourseLibraryState = {
      ...get().libraryState,
      progress: {
        ...get().libraryState.progress,
        [lessonPath]: progressItem,
      },
      courses: {
        ...get().libraryState.courses,
        [coursePath]: {
          ...currentMeta,
          status: allCourseLessonsCompleted ? 'completed' : 'in_progress',
          lastAccessedAt: new Date().toISOString(),
          lastWatchedLessonPath: lessonPath,
        },
      },
    };

    set({ libraryState: updatedState });
    scheduleDiskSync(get().rootDirHandle, updatedState, get().isDemoMode);
  },

  toggleLessonCompleted: (coursePath: string, lessonPath: string) => {
    const existing = get().libraryState.progress[lessonPath];
    const willBeCompleted = !existing?.completed;

    const progressItem: LessonProgress = {
      lessonPath,
      coursePath,
      currentTimeSeconds: willBeCompleted ? (existing?.durationSeconds || 0) : 0,
      durationSeconds: existing?.durationSeconds || 0,
      completed: willBeCompleted,
      completedAt: willBeCompleted ? new Date().toISOString() : undefined,
      watchCount: existing?.watchCount || 1,
      lastWatchedAt: new Date().toISOString(),
    };

    const updatedState: CourseLibraryState = {
      ...get().libraryState,
      progress: {
        ...get().libraryState.progress,
        [lessonPath]: progressItem,
      },
    };

    set({ libraryState: updatedState });
    scheduleDiskSync(get().rootDirHandle, updatedState, get().isDemoMode);
  },

  addOrUpdateNote: (noteData) => {
    const lessonPath = noteData.lessonPath;
    const existingNotes = get().libraryState.notes[lessonPath] || [];

    const now = new Date().toISOString();
    let updatedNotes: LessonNote[];

    if (noteData.id) {
      updatedNotes = existingNotes.map((n) =>
        n.id === noteData.id
          ? {
              ...n,
              ...noteData,
              updatedAt: now,
            }
          : n
      );
    } else {
      const newNote: LessonNote = {
        id: `note-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        lessonPath: noteData.lessonPath,
        coursePath: noteData.coursePath,
        timestampSeconds: Math.round(noteData.timestampSeconds),
        contentMarkdown: noteData.contentMarkdown,
        tags: noteData.tags || [],
        isBookmarkOnly: noteData.isBookmarkOnly || false,
        createdAt: now,
        updatedAt: now,
      };
      updatedNotes = [...existingNotes, newNote];
    }

    const updatedState: CourseLibraryState = {
      ...get().libraryState,
      notes: {
        ...get().libraryState.notes,
        [lessonPath]: updatedNotes,
      },
    };

    set({ libraryState: updatedState });
    scheduleDiskSync(get().rootDirHandle, updatedState, get().isDemoMode);
  },

  deleteNote: (noteId: string, lessonPath: string) => {
    const existingNotes = get().libraryState.notes[lessonPath] || [];
    const filtered = existingNotes.filter((n) => n.id !== noteId);

    const updatedState: CourseLibraryState = {
      ...get().libraryState,
      notes: {
        ...get().libraryState.notes,
        [lessonPath]: filtered,
      },
    };

    set({ libraryState: updatedState });
    scheduleDiskSync(get().rootDirHandle, updatedState, get().isDemoMode);
  },

  toggleFavoriteCourse: (coursePath: string) => {
    const currentMeta = get().libraryState.courses[coursePath] || {
      coursePath,
      clusterIds: [],
      tags: [],
      isFavorite: false,
      isArchived: false,
      status: 'not_started',
    };

    const updatedState: CourseLibraryState = {
      ...get().libraryState,
      courses: {
        ...get().libraryState.courses,
        [coursePath]: {
          ...currentMeta,
          isFavorite: !currentMeta.isFavorite,
        },
      },
    };

    set({ libraryState: updatedState });
    scheduleDiskSync(get().rootDirHandle, updatedState, get().isDemoMode);
  },

  setCourseCluster: (coursePath: string, clusterId: string) => {
    const currentMeta = get().libraryState.courses[coursePath] || {
      coursePath,
      clusterIds: [],
      tags: [],
      isFavorite: false,
      isArchived: false,
      status: 'not_started',
    };

    const clusterIds = currentMeta.clusterIds.includes(clusterId)
      ? currentMeta.clusterIds
      : [...currentMeta.clusterIds, clusterId];

    const updatedState: CourseLibraryState = {
      ...get().libraryState,
      courses: {
        ...get().libraryState.courses,
        [coursePath]: {
          ...currentMeta,
          clusterIds,
        },
      },
    };

    set({ libraryState: updatedState });
    scheduleDiskSync(get().rootDirHandle, updatedState, get().isDemoMode);
  },

  createCluster: (name: string, color: string, description?: string) => {
    const id = `cluster-${Date.now()}`;
    const newCluster = {
      id,
      name,
      color,
      description,
      coursePaths: [],
    };

    const updatedState: CourseLibraryState = {
      ...get().libraryState,
      clusters: {
        ...get().libraryState.clusters,
        [id]: newCluster,
      },
    };

    set({ libraryState: updatedState });
    scheduleDiskSync(get().rootDirHandle, updatedState, get().isDemoMode);
    return id;
  },

  setPlaybackSpeed: (speed: number) => {
    set({ playbackSpeed: speed });
    if (typeof window !== 'undefined') {
      localStorage.setItem('courseplex_playback_speed', speed.toString());
    }
  },

  setTheaterMode: (theater: boolean) => set({ isTheaterMode: theater }),
  toggleTheaterMode: () => set((s) => ({ isTheaterMode: !s.isTheaterMode })),
  setSearchQuery: (query: string) => set({ searchQuery: query }),
  setFilterCluster: (clusterId: string | null) => set({ filterCluster: clusterId }),
  setFilterStatus: (status) => set({ filterStatus: status }),
  setSortBy: (sort) => set({ sortBy: sort }),

  logStudySession: (coursePath: string, lessonPath: string, realMinutes: number, contentMinutes: number) => {
    if (realMinutes <= 0) return;

    const todayStr = new Date().toISOString().slice(0, 10);
    const sessions = [...get().libraryState.studySessions];

    // Check if session for this day + lesson already exists, add to it
    const existingIndex = sessions.findIndex(
      (s) => s.date === todayStr && s.lessonPath === lessonPath
    );

    if (existingIndex >= 0) {
      sessions[existingIndex] = {
        ...sessions[existingIndex],
        realMinutesSpent: Math.round((sessions[existingIndex].realMinutesSpent + realMinutes) * 10) / 10,
        contentMinutesCovered: Math.round((sessions[existingIndex].contentMinutesCovered + contentMinutes) * 10) / 10,
      };
    } else {
      sessions.push({
        id: `sess-${Date.now()}`,
        date: todayStr,
        coursePath,
        lessonPath,
        realMinutesSpent: Math.round(realMinutes * 10) / 10,
        contentMinutesCovered: Math.round(contentMinutes * 10) / 10,
      });
    }

    const updatedState: CourseLibraryState = {
      ...get().libraryState,
      studySessions: sessions,
    };

    set({ libraryState: updatedState });
    scheduleDiskSync(get().rootDirHandle, updatedState, get().isDemoMode);
  },

  setDailyGoalMinutes: (minutes: number) => {
    const updatedState: CourseLibraryState = {
      ...get().libraryState,
      dailyGoalMinutes: minutes,
    };
    set({ libraryState: updatedState });
    scheduleDiskSync(get().rootDirHandle, updatedState, get().isDemoMode);
  },

  exportCourseNotes: async (coursePath: string) => {
    const course = get().scannedCourses.find((c) => c.relativePath === coursePath);
    if (!course) throw new Error('Course not found');

    // Collect all notes for all lessons of this course
    const allNotes: LessonNote[] = [];
    for (const mod of course.modules) {
      for (const les of mod.lessons) {
        const notes = get().libraryState.notes[les.relativePath] || [];
        allNotes.push(...notes);
      }
    }

    if (allNotes.length === 0) {
      throw new Error('No notes found for this course yet. Add some notes first!');
    }

    if (course.courseDirHandle) {
      const fileName = await writeCourseNotesToDisk(course.courseDirHandle, allNotes, course.title);
      return fileName;
    } else {
      // Fallback: download as markdown file
      const lines = [
        `# Course Notes: ${course.title}`,
        `*Exported on ${new Date().toLocaleDateString()}*`,
        '',
        ...allNotes.map((n) => `### [${Math.floor(n.timestampSeconds / 60)}:${String(n.timestampSeconds % 60).padStart(2, '0')}]\n${n.contentMarkdown}\n`),
      ];
      const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${course.title.replace(/[^a-z0-9_-]/gi, '_')}_NOTES.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return 'Downloaded COURSE_NOTES.md';
    }
  },
}));
