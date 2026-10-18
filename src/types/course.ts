export interface CourseLibraryState {
  version: number;
  lastSyncedAt: string;
  clusters: Record<string, ClusterMeta>; // Custom user clusters & learning paths
  courses: Record<string, CourseUserMetadata>; // Keyed by relative course path
  progress: Record<string, LessonProgress>; // Keyed by relative lesson path
  notes: Record<string, LessonNote[]>; // Keyed by relative lesson path
  studySessions: StudySession[]; // Granular log for heatmaps & velocity stats
  dailyGoalMinutes: number;
}

export interface ClusterMeta {
  id: string;
  name: string;
  description?: string;
  color: string;
  coursePaths: string[]; // Ordered list of course relativePaths in this track
}

export interface CourseUserMetadata {
  coursePath: string;
  customTitle?: string;
  clusterIds: string[];
  tags: string[];
  isFavorite: boolean;
  isArchived: boolean;
  status: 'not_started' | 'in_progress' | 'completed';
  lastAccessedAt?: string;
  lastWatchedLessonPath?: string;
  rating?: number;
}

export interface LessonProgress {
  lessonPath: string;
  coursePath: string;
  currentTimeSeconds: number;
  durationSeconds: number;
  completed: boolean;
  completedAt?: string;
  watchCount: number;
  lastWatchedAt: string;
}

export interface LessonNote {
  id: string;
  lessonPath: string;
  coursePath: string;
  timestampSeconds: number; // Clicking jumps video player to this second
  contentMarkdown: string;
  tags: string[];
  isBookmarkOnly?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StudySession {
  id: string;
  date: string; // YYYY-MM-DD local time
  coursePath: string;
  lessonPath: string;
  realMinutesSpent: number; // Actual wall-clock time watching
  contentMinutesCovered: number; // Adjusted for 1.5x / 2x playback speed
}

// Runtime Scanned File Tree Types
export interface ScannedAttachment {
  name: string;
  type: 'pdf' | 'zip' | 'code' | 'doc' | 'image' | 'other';
  relativePath: string;
  file?: File;
  handle?: FileSystemFileHandle;
}

export interface ScannedLesson {
  id: string;
  title: string;
  rawTitle: string;
  orderIndex: number;
  relativePath: string;
  coursePath: string;
  modulePath?: string;
  isVideo: boolean;
  isResourceOnly: boolean;
  durationSeconds: number;
  videoFile?: File;
  videoHandle?: FileSystemFileHandle;
  subtitleFiles?: { name: string; lang: string; file?: File; handle?: FileSystemFileHandle }[];
  noteFile?: File;
  noteHandle?: FileSystemFileHandle;
  attachments: ScannedAttachment[];
}

export interface ScannedModule {
  id: string;
  title: string;
  rawTitle: string;
  orderIndex: number;
  relativePath: string;
  lessons: ScannedLesson[];
}

export interface ScannedCourse {
  id: string;
  title: string;
  rawTitle: string;
  relativePath: string;
  clusterId?: string;
  clusterName?: string;
  coverUrl?: string;
  coverFile?: File;
  coverHandle?: FileSystemFileHandle;
  modules: ScannedModule[];
  totalLessons: number;
  totalDurationSeconds: number;
  description?: string;
  courseDirHandle?: FileSystemDirectoryHandle;
}

export interface ScannedCluster {
  id: string;
  name: string;
  relativePath: string;
  color: string;
  coursePaths: string[];
}
