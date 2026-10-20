import { create } from 'zustand';
import {
  CourseLibraryState,
  ScannedCourse,
  ScannedCluster,
  ScannedLesson,
  LessonNote,
  LessonProgress,
  LessonChapter,
} from '@/types/course';
import { createDefaultLibraryState } from '@/lib/disk-sync';
import { apiUrl } from '@/lib/server-url';
import { durationHydrator } from '@/lib/duration-hydrator';
import { createDemoLibraryState, createDemoScannedData } from '@/lib/demo-data';

interface CourseStoreState {
  rootDirName: string | null;
  isDemoMode: boolean;
  isScanning: boolean;
  scanStatus: string;
  isInitialized: boolean;

  // Plex-Style Server Streaming Mode
  isServerMode: boolean;
  serverCoursesDir: string | null;
  isFolderModalOpen: boolean;
  setFolderModalOpen: (open: boolean) => void;
  connectServerDirectory: (dirPath: string) => Promise<void>;
  disconnectServerDirectory: () => Promise<void>;
  rescanServerDirectory: () => Promise<void>;

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
  loadDemoMode: () => void;

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
  setLessonChapters: (lessonPath: string, chapters: LessonChapter[]) => void;

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

function scheduleServerSync(state: CourseLibraryState, isDemoMode: boolean, isServerMode: boolean) {
  if (isDemoMode || !isServerMode) return;
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(async () => {
    try {
      await fetch(apiUrl('/api/local/state'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state }),
      });
    } catch (err) {
      console.warn('Background server state sync error:', err);
    }
  }, 1200);
}

export const useCourseStore = create<CourseStoreState>((set, get) => {
  const hydrateMissingDurations = (courses: ScannedCourse[]) => {
    const recordDuration = (lessonPath: string, dur: number) => {
      if (dur <= 0) return;
      const currentCourses = get().scannedCourses.map((c) => {
        let changed = false;
        let total = 0;
        const modules = c.modules.map((m) => ({
          ...m,
          lessons: m.lessons.map((l) => {
            if (l.relativePath === lessonPath && l.durationSeconds !== dur) {
              changed = true;
              total += dur;
              return { ...l, durationSeconds: dur };
            }
            total += l.durationSeconds || 0;
            return l;
          }),
        }));
        return changed ? { ...c, modules, totalDurationSeconds: total } : c;
      });

      const currentState = get().libraryState;
      const updatedState: CourseLibraryState = {
        ...currentState,
        durations: {
          ...(currentState.durations || {}),
          [lessonPath]: dur,
        },
      };

      set({
        scannedCourses: currentCourses,
        libraryState: updatedState,
      });
      scheduleServerSync(updatedState, get().isDemoMode, get().isServerMode);
    };

    for (const course of courses) {
      for (const mod of course.modules) {
        for (const lesson of mod.lessons) {
          if (lesson.isVideo && lesson.durationSeconds === 0) {
            const mediaUrl = apiUrl(`/api/local/media?path=${encodeURIComponent(lesson.relativePath)}`);
            durationHydrator.getCachedDuration(lesson.relativePath, mediaUrl).then((cached) => {
              if (cached) {
                recordDuration(lesson.relativePath, cached);
              } else {
                durationHydrator.enqueue({
                  relativePath: lesson.relativePath,
                  source: mediaUrl,
                  onResolved: (dur) => recordDuration(lesson.relativePath, dur),
                });
              }
            });
          }
        }
      }
    }
  };

  return {
    rootDirName: null,
    isDemoMode: false,
    isScanning: false,
    scanStatus: '',
    isInitialized: false,

    isServerMode: false,
    serverCoursesDir: null,
    isFolderModalOpen: false,
    setFolderModalOpen: (open: boolean) => set({ isFolderModalOpen: open }),

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

      try {
        const serverRes = await fetch(apiUrl('/api/local/courses'));
        if (serverRes.ok) {
          const data = await serverRes.json();
          if (data.configured) {
            const dirName = data.coursesDir
              ? data.coursesDir.split(/[\\/]/).filter(Boolean).pop() || data.coursesDir
              : 'Server Library';

            set({
              isServerMode: true,
              isDemoMode: false,
              serverCoursesDir: data.coursesDir,
              rootDirName: dirName,
              scannedCourses: data.courses || [],
              scannedClusters: data.clusters || [],
              libraryState: data.libraryState || createDefaultLibraryState(),
              isInitialized: true,
            });

            hydrateMissingDurations(data.courses || []);
            return;
          }
        }
      } catch (e) {
        console.warn('Could not check server courses API:', e);
      }

      set({ isInitialized: true });
    },

    connectServerDirectory: async (dirPath: string) => {
      set({ isScanning: true, scanStatus: 'Connecting server library folder...' });
      try {
        const res = await fetch(apiUrl('/api/local/config'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ coursesDir: dirPath }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to connect server directory');
        }

        await get().rescanServerDirectory();
      } catch (err) {
        set({ isScanning: false, scanStatus: '' });
        throw err;
      }
    },

    rescanServerDirectory: async () => {
      set({ isScanning: true, scanStatus: 'Scanning courses on server disk...' });
      try {
        const res = await fetch(apiUrl('/api/local/courses'));
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(data?.error || 'Failed to scan server courses');
        }

        const dirName = data.coursesDir
          ? data.coursesDir.split(/[\\/]/).filter(Boolean).pop() || data.coursesDir
          : 'Server Library';

        set({
          isServerMode: true,
          isDemoMode: false,
          serverCoursesDir: data.coursesDir,
          rootDirName: dirName,
          scannedCourses: data.courses || [],
          scannedClusters: data.clusters || [],
          libraryState: data.libraryState || get().libraryState,
          isScanning: false,
          scanStatus: '',
          isInitialized: true,
        });

        hydrateMissingDurations(data.courses || []);
      } catch (err) {
        set({ isScanning: false, scanStatus: '' });
        throw err;
      }
    },

    disconnectServerDirectory: async () => {
      try {
        await fetch(apiUrl('/api/local/config'), { method: 'DELETE' });
      } catch (e) {
        console.warn('Could not clear server directory config:', e);
      }
      set({
        isServerMode: false,
        serverCoursesDir: null,
        rootDirName: null,
        scannedCourses: [],
        scannedClusters: [],
        activeCourse: null,
        activeLesson: null,
        activeVideoUrl: null,
        activeSubtitleUrl: null,
        libraryState: createDefaultLibraryState(),
      });
    },

    loadDemoMode: () => {
      const demoState = createDemoLibraryState();
      const { courses, clusters } = createDemoScannedData();
      set({
        rootDirName: 'CoursePlex Demo Collection',
        isDemoMode: true,
        isServerMode: false,
        libraryState: demoState,
        scannedCourses: courses,
        scannedClusters: clusters,
        isScanning: false,
        scanStatus: '',
      });
    },

    selectCourse: (coursePath: string) => {
      const course = get().scannedCourses.find((c) => c.relativePath === coursePath);
      if (!course) return;

      set({ activeCourse: course });

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
      scheduleServerSync(updatedState, get().isDemoMode, get().isServerMode);
    },

    selectLesson: async (lesson: ScannedLesson) => {
      get().clearActiveLessonMedia();

      let videoUrl: string | null = null;
      let subtitleUrl: string | null = null;

      if (get().isServerMode) {
        if (lesson.isVideo) {
          videoUrl = apiUrl(`/api/local/media?path=${encodeURIComponent(lesson.relativePath)}`);
        }
        if (lesson.subtitleFiles && lesson.subtitleFiles.length > 0 && lesson.subtitleFiles[0].relativePath) {
          subtitleUrl = apiUrl(`/api/local/subtitles?path=${encodeURIComponent(lesson.subtitleFiles[0].relativePath)}`);
        }
      } else if (get().isDemoMode) {
        videoUrl = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
      }

      set({
        activeLesson: lesson,
        activeVideoUrl: videoUrl,
        activeSubtitleUrl: subtitleUrl,
      });

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
      scheduleServerSync(updatedState, get().isDemoMode, get().isServerMode);
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
      const isCompleted = completed !== undefined ? completed : duration > 0 && currentTime / duration >= 0.9;
      const roundedDur = Math.round(duration || existing?.durationSeconds || 0);

      const progressItem: LessonProgress = {
        lessonPath,
        coursePath,
        currentTimeSeconds: Math.round(currentTime),
        durationSeconds: roundedDur,
        completed: isCompleted || (existing?.completed ?? false),
        completedAt: isCompleted ? existing?.completedAt || new Date().toISOString() : existing?.completedAt,
        watchCount:
          (existing?.watchCount || 0) + (currentTime > 5 && (!existing || existing.currentTimeSeconds < 5) ? 1 : 0),
        lastWatchedAt: new Date().toISOString(),
      };

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
        durations:
          roundedDur > 0
            ? { ...(get().libraryState.durations || {}), [lessonPath]: roundedDur }
            : get().libraryState.durations,
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
      scheduleServerSync(updatedState, get().isDemoMode, get().isServerMode);
    },

    toggleLessonCompleted: (coursePath: string, lessonPath: string) => {
      const existing = get().libraryState.progress[lessonPath];
      const willBeCompleted = !existing?.completed;

      const progressItem: LessonProgress = {
        lessonPath,
        coursePath,
        currentTimeSeconds: willBeCompleted ? existing?.durationSeconds || 0 : 0,
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
      scheduleServerSync(updatedState, get().isDemoMode, get().isServerMode);
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
      scheduleServerSync(updatedState, get().isDemoMode, get().isServerMode);
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
      scheduleServerSync(updatedState, get().isDemoMode, get().isServerMode);
    },

    setLessonChapters: (lessonPath: string, chapters: LessonChapter[]) => {
      const updatedState: CourseLibraryState = {
        ...get().libraryState,
        chapters: {
          ...(get().libraryState.chapters || {}),
          [lessonPath]: chapters,
        },
      };
      set({ libraryState: updatedState });
      scheduleServerSync(updatedState, get().isDemoMode, get().isServerMode);
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
      scheduleServerSync(updatedState, get().isDemoMode, get().isServerMode);
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
      scheduleServerSync(updatedState, get().isDemoMode, get().isServerMode);
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
      scheduleServerSync(updatedState, get().isDemoMode, get().isServerMode);
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

      const existingIndex = sessions.findIndex((s) => s.date === todayStr && s.lessonPath === lessonPath);

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
      scheduleServerSync(updatedState, get().isDemoMode, get().isServerMode);
    },

    setDailyGoalMinutes: (minutes: number) => {
      const updatedState: CourseLibraryState = {
        ...get().libraryState,
        dailyGoalMinutes: minutes,
      };
      set({ libraryState: updatedState });
      scheduleServerSync(updatedState, get().isDemoMode, get().isServerMode);
    },

    exportCourseNotes: async (coursePath: string) => {
      const course = get().scannedCourses.find((c) => c.relativePath === coursePath);
      if (!course) throw new Error('Course not found');

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

      const lines = [
        `# Course Notes: ${course.title}`,
        `*Exported on ${new Date().toLocaleDateString()}*`,
        '',
        ...allNotes.map(
          (n) =>
            `### [${Math.floor(n.timestampSeconds / 60)}:${String(n.timestampSeconds % 60).padStart(2, '0')}]\n${n.contentMarkdown}\n`
        ),
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
    },
  };
});
