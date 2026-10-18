# CoursePlex: Local-First Online Course Hub (Vercel + Local HD Master Spec & Prompt)

Use this document as a master system prompt or phased specification for coding models (e.g., GPT-4o-mini, Claude Haiku, Gemini Flash, DeepSeek, or Qwen). You can paste the entire prompt at once or feed **Section 6 (Phased Execution Prompts)** step by step so smaller models never lose context.

## 1. Architectural Strategy: How Vercel + Local Hard Drive Works Without a Database

A cloud-hosted web app using the [Next.js App Router](https://www.google.com/search?q=https%3A%2F%2Fnextjs.org%2Fdocs%2Fapp) on Vercel runs in the browser and on remote serverless nodes—meaning cloud servers cannot directly read `C:\Courses` or `/Users/you/Courses`. However, you can achieve a **100% serverless, zero-database, zero-upload architecture** hosted on Vercel that streams videos directly from your local hard drive using browser-native APIs:

| Mechanism | Role in Architecture | How It Works |
| :--- | :--- | :--- |
| **[File System API](https://www.google.com/search?q=https%3A%2F%2Fdeveloper.mozilla.org%2Fen-US%2Fdocs%2FWeb%2FAPI%2FFile_System_API)** (`window.showDirectoryPicker()`) | Direct Local Disk R/W | Grants the Vercel-hosted frontend read/write access to a user-selected local directory. Videos stream instantly via `URL.createObjectURL(file)` with zero network upload. |
| **[IndexedDB API](https://www.google.com/search?q=https%3A%2F%2Fdeveloper.mozilla.org%2Fen-US%2Fdocs%2FWeb%2FAPI%2FIndexedDB_API)** (`idb-keyval` / `Dexie.js`) | Session Handle Persistence | Stores the `FileSystemDirectoryHandle` object in the browser's IndexedDB. When reopening the Vercel URL, the app calls `handle.requestPermission({ mode: 'readwrite' })` via a single click instead of re-picking folders. |
| **Disk Sidecar File** (`.courseplex-state.json`) | Portable "No-DB" Storage | Writes all user progress, watch history, study sessions, and timestamped Markdown notes directly into `.courseplex-state.json` inside your local root courses folder using `FileSystemFileHandle.createWritable()`. Clearing browser cache never loses your notes or progress. |
| **Directory Entries Fallback** ([File and Directory Entries API](https://www.google.com/search?q=https%3A%2F%2Fdeveloper.mozilla.org%2Fen-US%2Fdocs%2FWeb%2FAPI%2FFile_and_Directory_Entries_API)) | Non-Chromium Fallback | For browsers without full write handle support, falls back to `<input type="file" webkitdirectory>` + IndexedDB state with one-click JSON export/import. |

## 2. Platform Benchmarks & Feature Synthesis

This application merges the best UX patterns from leading media servers and learning platforms:

| Reference Platform | Borrowed Feature Pattern | Implementation in CoursePlex |
| :--- | :--- | :--- |
| **[Plex Media Server](https://www.google.com/search?q=https%3A%2F%2Fwww.plex.tv%2Fyour-media%2F)** | Local media scanner, "On Deck" queue, visual posters, exact-second resume | Recursive folder parser that turns messy directories into course cards, auto-extracts cover images (or generates video frame thumbnails), and maintains an **"On Deck / Continue Learning"** hero row. |
| **[Udemy](https://www.google.com/search?q=https%3A%2F%2Fwww.udemy.com%2Fpersonal-plan%2F)** | Structured module accordions, companion files, auto-complete threshold | Collapsible sidebar grouping lessons by module, inline downloadable/previewable lesson attachments (`.pdf`, `.html`, `.zip`, `.md`), and automatic lesson completion at **90% watched**. |
| **[Frontend Masters](https://www.google.com/search?q=https%3A%2F%2Fmaster.dev%2Fcourses%2F)** | Timestamp-linked Markdown notes & keyboard-centric playback | Taking a note automatically stamps `[MM:SS]`. Clicking any timestamp chip in your notes seeks the video player to that exact second. |
| **Command Palette UI** | Global Command Palette (`Cmd/Ctrl + K`) | Instant fuzzy search across all courses, clusters/tracks, lesson titles, and inside the full text of your Markdown notes. |
| **GitHub / Spaced Study** | Consistency heatmaps & study telemetry | 365-day contribution-style study activity grid, daily learning goal ring, playback speed time-saved calculator (`Real Time Watched` vs. `Content Duration Completed`), and global notes review. |

## 3. Copy-Paste Master System Prompt (For Single-Shot or Agentic Models)

Copy everything inside the block below when starting a new session with your coding model:

```markdown
# ROLE & OBJECTIVE
You are a Staff Frontend Architect building **CoursePlex**, a local-first, Plex-style web application for organizing, watching, and taking notes on locally stored video courses. The application must be deployable as a purely static/client-side Next.js (App Router) application on Vercel with ZERO backend database and ZERO cloud storage. All video streaming, subtitle loading, and data persistence happen directly against the user's local hard drive using the browser's File System Access API and IndexedDB.

# TECH STACK CONSTRAINTS
- **Framework**: Next.js 14+ (App Router, strict client-side rendering `'use client'` for file system views, static export compatible) + TypeScript.
- **Styling**: Tailwind CSS + Lucide React icons (dark-first cinema UI).
- **State & Persistence**:
  - `idb-keyval` (or native IndexedDB wrapper) to persist `FileSystemDirectoryHandle` and cached course metadata (including extracted video durations).
  - Direct local disk sidecar sync: read and write `.courseplex-state.json` at the root of the user's selected course directory via `FileSystemFileHandle.createWritable()`.
  - Zustand for reactive in-memory state management across the Player, Sidebar, Notes Studio, and Analytics views.
- **Markdown & Code Highlighting**: `react-markdown`, `remark-gfm` for rendering lesson notes and course READMEs.

# LOCAL DIRECTORY PARSING & CLUSTERING HEURISTICS
Users have messy local course folders on their hard drives. Build a deterministic recursive directory scanner (`src/lib/scanner.ts`) that supports two hierarchy depths:
1. **3-Level (Clustered)**: `[Root Folder] / [Cluster or Category Folder] / [Course Folder] / [Module Folder] / [Lesson Files]`
2. **2-Level (Flat Courses)**: `[Root Folder] / [Course Folder] / [Module Folder or Lesson Files]`

### Heuristic Rules:
- **Course vs. Cluster Detection**: A directory is a **Course** if it contains video files directly OR contains subdirectories that contain video files (Modules) OR contains a `course.json` override file. A top-level directory containing multiple Course directories (and no loose videos of its own) is treated as a **Cluster / Track** (e.g., "Frontend", "System Design", "Machine Learning"). Users can also manually assign or edit Clusters/Tags in the UI.
- **Filename Normalization & Natural Sorting**:
  - Sort directories and files using `Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })` so `2.mp4` comes before `10.mp4`.
  - Clean display titles via regex: strip leading numbering patterns (`^(\d+[\s._-]+|\[\d+\]\s*)+`), file extensions, and release tags (`\[1080p\]`, `\(x264\)`), while storing the extracted `orderIndex`.
- **Lesson Asset Grouping (Stem Matching)**:
  - Group files in the same folder that share a base filename stem into a single `Lesson` entity:
    - Primary Video: `.mp4`, `.mkv`, `.webm`, `.mov`
    - Subtitles: `.vtt`, `.srt` (match `lesson-01.mp4` with `lesson-01.en.srt` or `lesson-01.srt`)
    - Lesson Notes / Article: `.md`, `.txt`, `.html`
    - Attachments: `.pdf`, `.zip`, `.ipynb`, `.py`, `.js`, `.ts`
  - If a folder has a `.md` or `.pdf` without a matching video stem, create a "Reading / Resource Lesson" item in the module sequence.
- **Cover Poster Detection**:
  - Look for `cover.(jpg|png|webp)`, `poster.(jpg|png|webp)`, or `folder.(jpg|png|webp)` in the course root. If none exists, generate a deterministic gradient card with topic iconography or capture a frame at `t = 5s` from the first video into a cached Data URL.
- **Background Duration Hydrator**:
  - Because reading video duration requires loading metadata, run a non-blocking background worker queue (concurrency = 3) using an offscreen `<video preload="metadata">` element to populate `durationSeconds` for each video and cache the results by `[relativePath + fileLastModified]` in IndexedDB.

# CORE DATA SCHEMA (`src/types/course.ts`)
Implement the following TypeScript interfaces:

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

# REQUIRED APPLICATION VIEWS & FEATURES

## View 1: Library Home & Cluster Hub (`/`)
1. **Directory Connection Banner**:
   - State 1 (No handle saved): Prominent "Mount Local Courses Folder" CTA calling `window.showDirectoryPicker({ mode: 'readwrite' })`.
   - State 2 (Handle in IndexedDB, needs browser permission after reload): Single-click "Reconnect Local Drive (`[Folder Name]`)" button calling `handle.requestPermission({ mode: 'readwrite' })`, plus a "Rescan Disk" button.
2. **"On Deck / Continue Learning" Hero Carousel**:
   - Displays the top 4 most recently watched courses with exact lesson title, time remaining in current lesson, overall course progress bar, and a 1-click "Resume at [MM:SS]" button.
3. **Cluster & Learning Path Explorer**:
   - Auto-grouped folders + user-defined **Clusters / Tracks** (e.g., "Full-Stack Track", "AI Engineering", "Design Systems").
   - Ability to create custom Learning Paths where courses can be ordered sequentially.
4. **Filterable Course Grid**:
   - Filter by Cluster, Tag, Status (`All`, `In Progress`, `Unstarted`, `Completed`, `Favorites`), and Sort (`Recently Watched`, `Title A-Z`, `% Completed`, `Total Duration`).
   - Each Course Card displays: Poster/Gradient, Cluster badge, Module count, Lesson count, Total duration (`14h 20m`), and Progress bar (`42%`).

## View 2: Course Overview & Theater Player (`/course/[...coursePath]`)
1. **Custom HTML5 Theater Video Player**:
   - Streams local file via `URL.createObjectURL(file)` (revoking previous object URLs on unmount to prevent memory leaks).
   - **Automatic `.srt` to `WebVTT` Converter**: Reads local `.srt` files as text, converts comma timestamps (`00:01:20,500` -> `00:01:20.500`) with a `WEBVTT` header in memory, and attaches a Blob URL to `<track kind="subtitles">`.
   - **Playback Controls**: Speed selector (`0.5x`, `0.75x`, `1x`, `1.25x`, `1.5x`, `1.75x`, `2x`, `2.5x`—persisted globally), skip `-10s / +10s`, Picture-in-Picture toggle, Cinema/Theater mode toggle, and Auto-Advance countdown overlay (5s timer to next lesson).
   - **Auto-Save & Completion**: Throttled save of `currentTimeSeconds` every 3 seconds; auto-marks lesson complete at `>= 90%` progress.
   - **Keyboard Shortcuts**: `Space`/`K` (Play/Pause), `J`/`L` (-10s/+10s), `[` / `]` (Decrease/Increase speed), `M` (Mute), `F` (Fullscreen), `B` (Drop quick bookmark at current second), `N` (Focus note editor & insert current timestamp).
2. **Collapsible Curriculum Sidebar**:
   - Accordion of Modules -> Lessons with individual duration badges, completion checkboxes (manual toggle supported), active playing indicator, and attachment badges (`PDF`, `ZIP`, `MD`).
   - Search filter inside the course curriculum.
3. **Split-Pane Timestamped Notes Studio & Attachments Drawer**:
   - **Tab 1: Lesson Notes**:
     - Markdown editor with a "Capture Timestamp (`[04:32]`)" button (or automatic timestamp capture when starting a note while video is playing).
     - Optional **"Pause video while typing"** toggle for effortless note-taking.
     - Rendered note cards sorted by `timestampSeconds`; clicking the `[04:32]` badge immediately seeks the video player to `272` seconds.
     - Button to "Export Course Notes as `.md`" (writes a clean `COURSE_NOTES.md` file directly into the local course folder on the user's HD!).
   - **Tab 2: Companion Files & Slides**:
     - Lists all PDFs, HTML files, Markdown readmes, and code archives attached to the current lesson or module.
     - Inline preview modal for `.pdf`, `.md`, and `.txt` files right beside the video player.

## View 3: Progression, Statistics & Global Second Brain (`/stats` & `/notes`)
1. **365-Day Study Activity Heatmap**:
   - GitHub-style contribution grid colored by daily minutes studied (`studySessions`), alongside Current Streak (days), Longest Streak, and Daily Goal Ring (`e.g., 45 / 60 mins today`).
2. **Velocity & Efficiency Metrics**:
   - Total Courses Completed vs. In Progress.
   - Total Content Hours Completed vs. Actual Wall-Clock Hours Spent (highlighting hours saved via `1.25x–2x` playback speed).
   - Breakdown chart by Cluster/Category (e.g., 60% Backend, 25% DevOps, 15% UI/UX).
3. **Global Notes & Bookmarks Hub (`/notes`)**:
   - Search and filter across every note and timestamp bookmark taken across all courses by keyword, `#tag`, or course.
   - Clicking any note opens the Course Theater Player directly at that exact lesson and timestamp.

## Global Command Palette (`Cmd/Ctrl + K`)
- Accessible from anywhere in the app to fuzzy-search courses, jump to a specific lesson, search inside note contents, or trigger quick actions ("Rescan Local Folder", "Export Backup JSON", "Toggle Theme").
```

## 4. Deep-Dive Technical Blueprints for Complex Subsystems

Include these implementation details if your cheaper model needs concrete code patterns for the browser APIs:

### A. Persisting & Re-Verifying `FileSystemDirectoryHandle`
Browsers allow storing `FileSystemDirectoryHandle` in the [IndexedDB API](https://www.google.com/search?q=https%3A%2F%2Fdeveloper.mozilla.org%2Fen-US%2Fdocs%2FWeb%2FAPI%2FIndexedDB_API) as a structured clone, so the user never has to browse their hard drive tree again after the first setup:

```ts
// src/lib/fs-handle.ts
import { get, set } from 'idb-keyval';

const ROOT_HANDLE_KEY = 'courseplex_root_dir_handle';

export async function pickAndSaveRootDirectory(): Promise<FileSystemDirectoryHandle> {
  const handle = await (window as any).showDirectoryPicker({ mode: 'readwrite' });
  await set(ROOT_HANDLE_KEY, handle);
  return handle;
}

export async function getSavedRootDirectory(): Promise<{
  handle: FileSystemDirectoryHandle | null;
  permissionState: PermissionState | 'missing';
}> {
  const handle = await get<FileSystemDirectoryHandle>(ROOT_HANDLE_KEY);
  if (!handle) return { handle: null, permissionState: 'missing' };
  const perm = await (handle as any).queryPermission({ mode: 'readwrite' });
  return { handle, permissionState: perm };
}

export async function requestRootPermission(
  handle: FileSystemDirectoryHandle
): Promise<boolean> {
  const perm = await (handle as any).requestPermission({ mode: 'readwrite' });
  return perm === 'granted';
}
```

### B. Direct Hard Drive Sidecar Sync (`.courseplex-state.json`)
To satisfy the **"No Database, Everything on My HD"** requirement, sync the Zustand/IndexedDB state directly to a JSON file in the root directory on disk (debounced every 2 seconds on change):

```ts
// src/lib/disk-sync.ts
const SIDECAR_FILENAME = '.courseplex-state.json';

export async function readStateFromDisk(
  rootHandle: FileSystemDirectoryHandle
): Promise<CourseLibraryState | null> {
  try {
    const fileHandle = await rootHandle.getFileHandle(SIDECAR_FILENAME, { create: false });
    const file = await fileHandle.getFile();
    const text = await file.text();
    return JSON.parse(text) as CourseLibraryState;
  } catch {
    return null; // File doesn't exist yet on first run
  }
}

export async function writeStateToDisk(
  rootHandle: FileSystemDirectoryHandle,
  state: CourseLibraryState
): Promise<void> {
  const fileHandle = await rootHandle.getFileHandle(SIDECAR_FILENAME, { create: true });
  const writable = await (fileHandle as any).createWritable();
  await writable.write(JSON.stringify(state, null, 2));
  await writable.close();
}
```

### C. Zero-Dependency `.srt` to `WebVTT` In-Memory Converter
Most downloaded local courses include `.srt` subtitle files, while HTML5 `<track>` requires `.vtt`. Convert them on the fly in memory using the [FileReader API](https://www.google.com/search?q=https%3A%2F%2Fdeveloper.mozilla.org%2Fen-US%2Fdocs%2FWeb%2FAPI%2FFileReader) / `File.text()`:

```ts
// src/lib/subtitles.ts
export async function createVttBlobUrlFromSrtFile(file: File): Promise<string> {
  const rawText = await file.text();
  if (rawText.trim().startsWith('WEBVTT')) {
    return URL.createObjectURL(new Blob([rawText], { type: 'text/vtt' }));
  }
  const vttBody = rawText
    .replace(/\r\n/g, '\n')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  const vttContent = `WEBVTT\n\n${vttBody}`;
  return URL.createObjectURL(new Blob([vttContent], { type: 'text/vtt' }));
}
```

## 5. Recommended Local Folder Structure & Optional Overrides

While the scanner works automatically on any existing course folders, it also supports an optional `course.json` inside any course directory if you want custom metadata:

```text
/MyLocalCourses (Selected Root Folder)
├── .courseplex-state.json          <-- Auto-generated & synced by the app (progress, notes, streaks)
├── 01 - Full-Stack Web Development <-- Detected as Cluster / Track
│   ├── React Performance Mastery   <-- Detected as Course
│   │   ├── cover.jpg               <-- Auto-detected Course Poster
│   │   ├── COURSE_NOTES.md         <-- Auto-exported Markdown compilation of user notes
│   │   ├── 01 - Introduction       <-- Detected as Module 1
│   │   │   ├── 01 - Welcome.mp4
│   │   │   ├── 01 - Welcome.en.srt <-- Auto-paired & converted to WebVTT
│   │   │   └── 01 - Slides.pdf     <-- Attached to Lesson 1
│   │   └── 02 - Profiling & Memoization
│   │       └── ...
└── 02 - Machine Learning & AI      <-- Detected as Cluster / Track
```

## 6. Phased Execution Prompts (For Smaller / Cheaper Models)

If you use a model with smaller output limits (like GPT-4o-mini, Claude Haiku, or a local open-weight model), feed these **5 sequential prompts** one turn at a time after sharing the spec above:

### Prompt 1 of 5: Project Scaffolding, Types & Local Disk Persistence Engine
> "Following the CoursePlex specification, implement **Phase 1**:
> 1. Create `src/types/course.ts` with all TypeScript interfaces (`CourseLibraryState`, `ClusterMeta`, `CourseUserMetadata`, `LessonProgress`, `LessonNote`, `StudySession`, plus the runtime scanned tree types `ScannedCourse`, `ScannedModule`, `ScannedLesson`).
> 2. Create `src/lib/fs-handle.ts` and `src/lib/disk-sync.ts` for picking the local folder via `showDirectoryPicker`, saving the `FileSystemDirectoryHandle` in IndexedDB (`idb-keyval`), requesting permission on reload, and reading/writing `.courseplex-state.json` directly on the local hard drive.
> 3. Create the global Zustand store `src/store/useCourseStore.ts` that merges the scanned file tree with the persisted `.courseplex-state.json` state and debounces writes back to the local disk. Output complete, production-ready code with no placeholders."

### Prompt 2 of 5: Recursive Heuristic Folder Scanner & Metadata Hydrator
> "Now implement **Phase 2**:
> 1. Build `src/lib/scanner.ts` to recursively traverse the user's `FileSystemDirectoryHandle`. Implement natural sorting (`Intl.Collator`), regex title cleaning, 2-level vs. 3-level Cluster/Course/Module detection, cover image discovery, and basename stem matching to group `.mp4/.mkv/.webm` videos with `.srt/.vtt` subtitles and `.pdf/.md/.zip` attachments into `ScannedLesson` objects.
> 2. Build `src/lib/duration-hydrator.ts`, a background queue that loads video metadata via an offscreen `<video preload="metadata">` element (concurrency = 3) to extract exact lesson and course durations and caches them in IndexedDB keyed by `relativePath + lastModified`."

### Prompt 3 of 5: Plex-Style Home Dashboard, "On Deck" Queue & Cluster Hub
> "Now implement **Phase 3**:
> 1. Build the dark-mode App Shell (`src/app/layout.tsx`) with sidebar navigation (`Library Home`, `Clusters & Tracks`, `All Notes`, `Analytics & Streaks`, and `Cmd+K` search trigger) plus a top status bar showing the connected local folder status and a 'Rescan Disk' action.
> 2. Build the Home Dashboard (`src/app/page.tsx`) featuring:
>    - The 'Connect / Reconnect Local Hard Drive' onboarding & permission banner.
>    - The 'On Deck / Continue Learning' hero shelf showing the 4 most recently watched courses with 1-click resume at the exact timestamp.
>    - Cluster/Track filter pills, status filters, search input, and a responsive Course Poster Grid with progress bars, duration badges, and favorite toggles."

### Prompt 4 of 5: Theater Video Player, Live `.srt` Subtitles & Timestamped Notes Studio
> "Now implement **Phase 4**:
> 1. Build the Course Player View (`src/app/course/[...slug]/page.tsx`) with a Theater Mode layout.
> 2. Create `src/components/VideoPlayer.tsx` streaming the local `File` via `URL.createObjectURL`, integrating `src/lib/subtitles.ts` for automatic `.srt` to `WebVTT` conversion, playback speed persistence (`0.5x–2.5x`), auto-advance countdown, keyboard shortcuts (`Space`, `J`, `K`, `L`, `[`, `]`, `N`, `B`), throttled progress saving every 3s, and automatic completion at 90% watched.
> 3. Create the collapsible Curriculum Sidebar (`src/components/CurriculumSidebar.tsx`) and the Split-Pane Notes & Attachments Studio (`src/components/NotesStudio.tsx`) supporting clickable `[MM:SS]` timestamp badges that seek the video player, 'Pause while typing' mode, inline PDF/Markdown attachment preview, and a 'Write `COURSE_NOTES.md` to Course Folder' export button."

### Prompt 5 of 5: Progression Analytics, 365-Day Heatmap & Global Command Palette
> "Now implement **Phase 5**:
> 1. Build the Progression & Statistics page (`src/app/stats/page.tsx`) featuring a 365-day GitHub-style study heatmap, current/longest streak counters, Daily Study Goal progress ring, Cluster time distribution breakdown, and 'Real Time Spent vs. Content Hours Completed' speed-efficiency cards.
> 2. Build the Global Notes & Bookmarks Explorer (`src/app/notes/page.tsx`) with full-text and `#tag` filtering across all courses, linking each note directly back to its video timestamp.
> 3. Build the Global Command Palette (`src/components/CommandPalette.tsx` bound to `Cmd/Ctrl + K`) to fuzzy-search courses, lessons, and notes from anywhere in the app."
