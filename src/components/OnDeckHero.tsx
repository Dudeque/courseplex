'use client';

import React from 'react';
import Link from 'next/link';
import { useCourseStore } from '@/store/useCourseStore';
import { Play, Clock, Sparkles } from 'lucide-react';

export function OnDeckHero() {
  const { scannedCourses, libraryState, selectCourse, selectLesson } = useCourseStore();

  // Find courses that are in progress, sorted by lastAccessedAt descending
  const onDeckCourses = scannedCourses
    .map((course) => {
      const meta = libraryState.courses[course.relativePath];
      const lastAccessed = meta?.lastAccessedAt ? new Date(meta.lastAccessedAt).getTime() : 0;
      const lastLessonPath = meta?.lastWatchedLessonPath;

      // Find the last watched lesson, or fallback to first uncompleted lesson
      let targetLesson = null;
      let targetProgress = null;

      for (const mod of course.modules) {
        for (const les of mod.lessons) {
          if (lastLessonPath && les.relativePath === lastLessonPath) {
            targetLesson = les;
            targetProgress = libraryState.progress[les.relativePath];
            break;
          }
          if (!targetLesson && !libraryState.progress[les.relativePath]?.completed) {
            targetLesson = les;
            targetProgress = libraryState.progress[les.relativePath];
          }
        }
        if (targetLesson && lastLessonPath && targetLesson.relativePath === lastLessonPath) break;
      }

      if (!targetLesson && course.modules[0]?.lessons[0]) {
        targetLesson = course.modules[0].lessons[0];
        targetProgress = libraryState.progress[targetLesson.relativePath];
      }

      return {
        course,
        meta,
        lastAccessed,
        targetLesson,
        targetProgress,
      };
    })
    .filter((item) => item.lastAccessed > 0 || (item.targetProgress && item.targetProgress.currentTimeSeconds > 0))
    .sort((a, b) => b.lastAccessed - a.lastAccessed)
    .slice(0, 4);

  if (onDeckCourses.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-400" />
          On Deck / Continue Learning
        </h2>
        <span className="text-xs text-gray-400">Plex-Style Queue</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {onDeckCourses.map(({ course, targetLesson, targetProgress }) => {
          const currentTime = targetProgress?.currentTimeSeconds || 0;
          const duration = targetProgress?.durationSeconds || targetLesson?.durationSeconds || 0;
          const remainingSecs = Math.max(0, duration - currentTime);
          const remainingMins = Math.ceil(remainingSecs / 60);

          const curMins = Math.floor(currentTime / 60);
          const curSecs = Math.floor(currentTime % 60);
          const resumeTimeStr = `${String(curMins).padStart(2, '0')}:${String(curSecs).padStart(2, '0')}`;

          const lessonProgressPct = duration > 0 ? Math.min(100, Math.round((currentTime / duration) * 100)) : 0;

          return (
            <div
              key={course.relativePath}
              className="group relative bg-[#121626] border border-white/10 hover:border-indigo-500/50 rounded-2xl p-4 flex flex-col justify-between gap-4 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/10"
            >
              <div className="space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wider truncate">
                    {course.title}
                  </span>
                  {remainingMins > 0 && (
                    <span className="text-[10px] text-gray-400 flex items-center gap-1 shrink-0 bg-white/5 px-2 py-0.5 rounded-md">
                      <Clock className="w-3 h-3 text-indigo-400" />
                      {remainingMins}m left
                    </span>
                  )}
                </div>

                <div className="font-semibold text-sm text-white line-clamp-2">
                  {targetLesson?.title || 'Next Lesson'}
                </div>
              </div>

              {/* Progress bar in lesson */}
              <div className="space-y-3">
                <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                    style={{ width: `${lessonProgressPct}%` }}
                  />
                </div>

                <Link
                  href={`/course/${encodeURIComponent(course.relativePath)}${
                    targetLesson ? `?lesson=${encodeURIComponent(targetLesson.relativePath)}` : ''
                  }`}
                  onClick={async () => {
                    selectCourse(course.relativePath);
                    if (targetLesson) {
                      await selectLesson(targetLesson);
                    }
                  }}
                  className="w-full py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 group-hover:scale-[1.02]"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Resume at {resumeTimeStr}</span>
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
