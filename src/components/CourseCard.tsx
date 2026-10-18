'use client';

import React from 'react';
import Link from 'next/link';
import { ScannedCourse } from '@/types/course';
import { useCourseStore } from '@/store/useCourseStore';
import {
  Clock,
  PlayCircle,
  Star,
  CheckCircle2,
  Layers,
  FolderOpen,
} from 'lucide-react';

interface CourseCardProps {
  course: ScannedCourse;
}

export function CourseCard({ course }: CourseCardProps) {
  const { libraryState, toggleFavoriteCourse, selectCourse } = useCourseStore();

  const userMeta = libraryState.courses[course.relativePath];
  const isFavorite = userMeta?.isFavorite ?? false;

  // Calculate overall course progress
  let completedCount = 0;
  let totalWatchedSeconds = 0;
  let totalCourseSeconds = 0;

  for (const mod of course.modules) {
    for (const les of mod.lessons) {
      totalCourseSeconds += les.durationSeconds;
      const prog = libraryState.progress[les.relativePath];
      if (prog) {
        if (prog.completed) {
          completedCount++;
        }
        totalWatchedSeconds += Math.min(
          prog.currentTimeSeconds,
          prog.durationSeconds || les.durationSeconds
        );
      }
    }
  }

  const progressPercent =
    course.totalLessons > 0
      ? Math.round((completedCount / course.totalLessons) * 100)
      : 0;

  // Format duration
  const totalMinutes = Math.round((course.totalDurationSeconds || totalCourseSeconds) / 60);
  const hours = Math.floor(totalMinutes / 60);
  const remainingMins = totalMinutes % 60;
  const durationText =
    hours > 0 ? `${hours}h ${remainingMins}m` : `${remainingMins || 1}m`;

  // Deterministic gradient fallback if no cover image
  const gradientColors = [
    'from-indigo-900/60 via-purple-900/40 to-slate-900',
    'from-blue-900/60 via-cyan-900/40 to-slate-900',
    'from-emerald-900/60 via-teal-900/40 to-slate-900',
    'from-rose-900/60 via-pink-900/40 to-slate-900',
    'from-amber-900/60 via-orange-900/40 to-slate-900',
  ];
  const hash = course.relativePath
    .split('')
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const gradientClass = gradientColors[hash % gradientColors.length];

  const status =
    progressPercent === 100
      ? 'completed'
      : progressPercent > 0
      ? 'in_progress'
      : 'not_started';

  return (
    <div className="group relative bg-[#111420] border border-white/5 hover:border-indigo-500/40 rounded-2xl overflow-hidden transition-all duration-300 hover:shadow-2xl hover:shadow-indigo-500/10 flex flex-col">
      {/* Poster Media Area */}
      <Link
        href={`/course/${encodeURIComponent(course.relativePath)}`}
        onClick={() => selectCourse(course.relativePath)}
        className="relative aspect-video w-full overflow-hidden bg-black/40 block"
      >
        {course.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={course.coverUrl}
            alt={course.title}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div
            className={`w-full h-full bg-gradient-to-tr ${gradientClass} flex flex-col items-center justify-center p-6 text-center`}
          >
            <FolderOpen className="w-10 h-10 text-white/20 mb-2 group-hover:text-indigo-400 group-hover:scale-110 transition-all duration-300" />
            <span className="text-xs font-semibold text-white/50 tracking-wide uppercase">
              {course.clusterName || 'Course'}
            </span>
          </div>
        )}

        {/* Hover Cinema Play Button */}
        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-xs">
          <div className="w-12 h-12 rounded-full bg-indigo-600/90 text-white flex items-center justify-center shadow-lg shadow-indigo-600/50 transform scale-90 group-hover:scale-100 transition-transform">
            <PlayCircle className="w-7 h-7" />
          </div>
        </div>

        {/* Duration Badge */}
        <div className="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md text-[11px] font-mono text-gray-200 flex items-center gap-1 border border-white/10">
          <Clock className="w-3 h-3 text-indigo-400" />
          <span>{durationText}</span>
        </div>

        {/* Cluster Pill */}
        {course.clusterName && (
          <div className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-full bg-black/70 backdrop-blur-md text-[10px] font-medium text-indigo-300 border border-white/10 flex items-center gap-1">
            <Layers className="w-2.5 h-2.5" />
            <span className="truncate max-w-[120px]">{course.clusterName}</span>
          </div>
        )}
      </Link>

      {/* Course Info */}
      <div className="p-4 flex-1 flex flex-col justify-between gap-3">
        <div>
          <div className="flex items-start justify-between gap-2">
            <Link
              href={`/course/${encodeURIComponent(course.relativePath)}`}
              onClick={() => selectCourse(course.relativePath)}
              className="font-bold text-white text-base leading-snug line-clamp-2 hover:text-indigo-400 transition-colors"
            >
              {course.title}
            </Link>
            <button
              onClick={() => toggleFavoriteCourse(course.relativePath)}
              className={`p-1.5 rounded-lg transition-colors ${
                isFavorite
                  ? 'text-amber-400 hover:text-amber-300'
                  : 'text-gray-600 hover:text-gray-300'
              }`}
              title={isFavorite ? 'Remove from favorites' : 'Mark as favorite'}
            >
              <Star className={`w-4 h-4 ${isFavorite ? 'fill-amber-400' : ''}`} />
            </button>
          </div>

          <div className="flex items-center gap-3 text-xs text-gray-400 mt-2">
            <span>{course.modules.length} Modules</span>
            <span>•</span>
            <span>{course.totalLessons} Lessons</span>
          </div>
        </div>

        {/* Progress bar & Status */}
        <div className="space-y-1.5 pt-2 border-t border-white/5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-400 font-medium">
              {progressPercent === 100 ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Completed
                </span>
              ) : progressPercent > 0 ? (
                <span>{progressPercent}% Complete</span>
              ) : (
                <span className="text-gray-500">Not started</span>
              )}
            </span>
            <span className="text-gray-500 text-[11px]">
              {completedCount}/{course.totalLessons}
            </span>
          </div>
          <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                progressPercent === 100
                  ? 'bg-emerald-500'
                  : 'bg-gradient-to-r from-indigo-500 to-purple-500'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
