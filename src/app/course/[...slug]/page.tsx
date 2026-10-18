'use client';

import React, { useEffect, useState, useMemo, use, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useCourseStore } from '@/store/useCourseStore';
import { VideoPlayer } from '@/components/VideoPlayer';
import { CurriculumSidebar } from '@/components/CurriculumSidebar';
import { NotesStudio } from '@/components/NotesStudio';
import { ScannedLesson } from '@/types/course';
import {
  ArrowLeft,
  Tv,
  FileText,
  Star,
  CheckCircle2,
  Clock,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';

interface CoursePageProps {
  params: Promise<{ slug: string[] }>;
}

function CoursePlayerContent({ params }: CoursePageProps) {
  const resolvedParams = use(params);
  const searchParams = useSearchParams();
  const router = useRouter();

  const coursePath = useMemo(() => {
    return resolvedParams.slug.map((s) => decodeURIComponent(s)).join('/');
  }, [resolvedParams.slug]);

  const lessonQuery = searchParams.get('lesson');
  const timestampQuery = searchParams.get('t');

  const {
    scannedCourses,
    activeLesson,
    selectCourse,
    selectLesson,
    isTheaterMode,
    libraryState,
    toggleFavoriteCourse,
  } = useCourseStore();

  const [currentVideoTime, setCurrentVideoTime] = useState<number>(0);
  const [targetSeekTime, setTargetSeekTime] = useState<number>(
    timestampQuery ? parseFloat(timestampQuery) : 0
  );
  const [noteTimestampPreset, setNoteTimestampPreset] = useState<number | null>(null);

  // Find course
  const course = useMemo(() => {
    return (
      scannedCourses.find((c) => c.relativePath === coursePath) ||
      scannedCourses.find((c) => (coursePath === '_root_' || coursePath === '.') && (c.relativePath === '_root_' || c.relativePath === '.')) ||
      scannedCourses.find((c) => c.title.toLowerCase() === coursePath.toLowerCase())
    );
  }, [scannedCourses, coursePath]);

  // Set active course in store
  useEffect(() => {
    if (course) {
      selectCourse(course.relativePath);
    }
  }, [course, selectCourse]);

  // Flatten lessons in sequence for next/prev navigation
  const flatLessons = useMemo(() => {
    if (!course) return [];
    const list: ScannedLesson[] = [];
    for (const mod of course.modules) {
      for (const les of mod.lessons) {
        list.push(les);
      }
    }
    return list;
  }, [course]);

  // Select initial lesson based on query or last saved progress
  useEffect(() => {
    if (!course || flatLessons.length === 0) return;

    if (lessonQuery) {
      const match = flatLessons.find(
        (l) => l.relativePath === lessonQuery || l.title === lessonQuery
      );
      if (match && (!activeLesson || activeLesson.relativePath !== match.relativePath)) {
        selectLesson(match);
        return;
      }
    }

    if (!activeLesson) {
      // Check last watched lesson in user metadata
      const meta = libraryState.courses[course.relativePath];
      if (meta?.lastWatchedLessonPath) {
        const lastWatched = flatLessons.find(
          (l) => l.relativePath === meta.lastWatchedLessonPath
        );
        if (lastWatched) {
          selectLesson(lastWatched);
          return;
        }
      }
      // Otherwise first lesson
      selectLesson(flatLessons[0]);
    }
  }, [course, lessonQuery, flatLessons, activeLesson, selectLesson, libraryState.courses]);

  const activeLessonIndex = useMemo(() => {
    if (!activeLesson) return -1;
    return flatLessons.findIndex((l) => l.relativePath === activeLesson.relativePath);
  }, [flatLessons, activeLesson]);

  const hasNextLesson = activeLessonIndex >= 0 && activeLessonIndex < flatLessons.length - 1;
  const hasPrevLesson = activeLessonIndex > 0;

  const handleNextLesson = () => {
    if (hasNextLesson) {
      const nextLes = flatLessons[activeLessonIndex + 1];
      selectLesson(nextLes);
      router.replace(
        `/course/${encodeURIComponent(coursePath)}?lesson=${encodeURIComponent(nextLes.relativePath)}`
      );
    }
  };

  const handlePrevLesson = () => {
    if (hasPrevLesson) {
      const prevLes = flatLessons[activeLessonIndex - 1];
      selectLesson(prevLes);
      router.replace(
        `/course/${encodeURIComponent(coursePath)}?lesson=${encodeURIComponent(prevLes.relativePath)}`
      );
    }
  };

  const handleSeek = (seconds: number) => {
    setTargetSeekTime(seconds);
  };

  if (!course) {
    return (
      <div className="p-12 text-center max-w-xl mx-auto space-y-4">
        <Tv className="w-12 h-12 text-indigo-400 mx-auto" />
        <h2 className="text-xl font-bold text-white">Course Not Found</h2>
        <p className="text-xs text-gray-400">
          The requested course &quot;{coursePath}&quot; could not be found in your scanned library.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Library Home</span>
        </Link>
      </div>
    );
  }

  const currentLesson = activeLesson || flatLessons[0];
  const userMeta = libraryState.courses[course.relativePath];
  const isFavorite = userMeta?.isFavorite ?? false;

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header & Breadcrumbs */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/"
            className="p-2 rounded-xl bg-[#121626] border border-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Back to courses"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-indigo-400 flex items-center gap-1.5 truncate">
              <span>{course.clusterName || 'Course'}</span>
              <span>•</span>
              <span className="truncate">{course.title}</span>
            </div>
            <h1 className="text-lg md:text-xl font-black text-white truncate">
              {currentLesson ? currentLesson.title : course.title}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => toggleFavoriteCourse(course.relativePath)}
            className={`p-2 rounded-xl border border-white/5 transition-all ${
              isFavorite
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                : 'bg-[#121626] text-gray-400 hover:text-white'
            }`}
            title="Toggle Favorite"
          >
            <Star className={`w-4 h-4 ${isFavorite ? 'fill-current' : ''}`} />
          </button>
        </div>
      </div>

      {/* Main Theater Player & Side Panels */}
      <div
        className={`grid gap-6 ${
          isTheaterMode
            ? 'grid-cols-1'
            : 'grid-cols-1 lg:grid-cols-12'
        }`}
      >
        {/* Theater Video Player Column */}
        <div className={isTheaterMode ? 'w-full space-y-4' : 'lg:col-span-8 space-y-4'}>
          {currentLesson && (
            <VideoPlayer
              lesson={currentLesson}
              initialTime={targetSeekTime}
              hasNextLesson={hasNextLesson}
              onNextLesson={handleNextLesson}
              onTakeNote={(t) => setNoteTimestampPreset(t)}
              onDropBookmark={(t) => {
                useCourseStore.getState().addOrUpdateNote({
                  lessonPath: currentLesson.relativePath,
                  coursePath: course.relativePath,
                  timestampSeconds: t,
                  contentMarkdown: 'Bookmark',
                  isBookmarkOnly: true,
                  tags: ['bookmark'],
                });
              }}
            />
          )}

          {/* Lesson Navigation and Quick Actions */}
          <div className="flex items-center justify-between p-4 rounded-2xl bg-[#111422] border border-white/5">
            <button
              onClick={handlePrevLesson}
              disabled={!hasPrevLesson}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 text-gray-300 text-xs font-medium transition-all flex items-center gap-1.5"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Previous Lesson</span>
            </button>

            <span className="text-xs text-gray-400 font-mono">
              Lesson {activeLessonIndex + 1} of {flatLessons.length}
            </span>

            <button
              onClick={handleNextLesson}
              disabled={!hasNextLesson}
              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white text-xs font-semibold transition-all flex items-center gap-1.5 shadow-md shadow-indigo-600/30"
            >
              <span>Next Lesson</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Side Panels: Curriculum Sidebar & Notes Studio */}
        <div
          className={`${
            isTheaterMode
              ? 'grid grid-cols-1 md:grid-cols-2 gap-6'
              : 'lg:col-span-4 flex flex-col gap-6'
          }`}
        >
          {/* Notes Studio Drawer */}
          {currentLesson && (
            <div className="h-[440px]">
              <NotesStudio
                lesson={currentLesson}
                currentVideoTime={currentVideoTime}
                onSeek={handleSeek}
                presetTimestamp={noteTimestampPreset}
              />
            </div>
          )}

          {/* Curriculum Accordion */}
          <div className="h-[440px]">
            <CurriculumSidebar
              course={course}
              activeLesson={currentLesson}
              onSelectLesson={(les) => {
                selectLesson(les);
                router.replace(
                  `/course/${encodeURIComponent(coursePath)}?lesson=${encodeURIComponent(les.relativePath)}`
                );
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CoursePlayerPage(props: CoursePageProps) {
  return (
    <Suspense
      fallback={
        <div className="p-12 text-center text-gray-400 text-sm">
          Loading player...
        </div>
      }
    >
      <CoursePlayerContent {...props} />
    </Suspense>
  );
}
