'use client';

import React, { useState } from 'react';
import { ScannedCourse, ScannedLesson } from '@/types/course';
import { useCourseStore } from '@/store/useCourseStore';
import {
  ChevronDown,
  ChevronRight,
  Play,
  CheckCircle2,
  Circle,
  FileText,
  FileCode,
  FileArchive,
  Search,
  BookOpen,
} from 'lucide-react';

interface CurriculumSidebarProps {
  course: ScannedCourse;
  activeLesson: ScannedLesson | null;
  onSelectLesson: (lesson: ScannedLesson) => void;
}

export function CurriculumSidebar({
  course,
  activeLesson,
  onSelectLesson,
}: CurriculumSidebarProps) {
  const { libraryState, toggleLessonCompleted } = useCourseStore();
  const [filterQuery, setFilterQuery] = useState('');
  const [collapsedModules, setCollapsedModules] = useState<Record<string, boolean>>({});

  const toggleModuleCollapse = (moduleId: string) => {
    setCollapsedModules((prev) => ({
      ...prev,
      [moduleId]: !prev[moduleId],
    }));
  };

  const formatDuration = (seconds: number) => {
    if (!seconds) return '';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="bg-[#0f121e] border border-white/5 rounded-2xl p-4 flex flex-col gap-4 h-full">
      {/* Sidebar Header & Course Summary */}
      <div className="space-y-3">
        <div>
          <span className="text-[10px] uppercase font-bold text-indigo-400 tracking-wider">
            Curriculum
          </span>
          <h3 className="font-bold text-white text-base truncate">{course.title}</h3>
        </div>

        {/* Filter Input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            className="w-full bg-[#151929] border border-white/5 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/50"
            placeholder="Search lessons..."
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Modules List */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {course.modules.map((module, modIdx) => {
          const isCollapsed = collapsedModules[module.id] ?? false;

          const filteredLessons = module.lessons.filter((l) =>
            filterQuery.trim()
              ? l.title.toLowerCase().includes(filterQuery.toLowerCase())
              : true
          );

          if (filterQuery.trim() && filteredLessons.length === 0) {
            return null;
          }

          // Module progress count
          const completedCount = module.lessons.filter(
            (l) => libraryState.progress[l.relativePath]?.completed
          ).length;

          return (
            <div
              key={module.id}
              className="border border-white/5 rounded-xl bg-[#121626]/70 overflow-hidden"
            >
              {/* Module Accordion Header */}
              <button
                onClick={() => toggleModuleCollapse(module.id)}
                className="w-full p-3 flex items-center justify-between text-left hover:bg-white/5 transition-colors gap-2"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  {isCollapsed ? (
                    <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-gray-200 truncate">
                      {module.title}
                    </div>
                    <div className="text-[10px] text-gray-400">
                      {completedCount}/{module.lessons.length} completed
                    </div>
                  </div>
                </div>

                <span className="text-[10px] font-mono text-gray-400 shrink-0 px-2 py-0.5 rounded bg-white/5">
                  Section {modIdx + 1}
                </span>
              </button>

              {/* Lessons List in Module */}
              {!isCollapsed && (
                <div className="p-1.5 pt-0 space-y-1 border-t border-white/5">
                  {filteredLessons.map((lesson) => {
                    const isActive = activeLesson?.relativePath === lesson.relativePath;
                    const progress = libraryState.progress[lesson.relativePath];
                    const isCompleted = progress?.completed ?? false;

                    return (
                      <div
                        key={lesson.id}
                        className={`group/item flex items-center justify-between p-2 rounded-xl text-xs transition-all ${
                          isActive
                            ? 'bg-indigo-600/30 border border-indigo-500/40 text-white font-medium'
                            : 'hover:bg-white/5 text-gray-300 border border-transparent'
                        }`}
                      >
                        {/* Completion Checkbox */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleLessonCompleted(course.relativePath, lesson.relativePath);
                          }}
                          className="mr-2 text-gray-400 hover:text-indigo-400 transition-colors shrink-0"
                          title={isCompleted ? 'Mark uncompleted' : 'Mark completed'}
                        >
                          {isCompleted ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <Circle className="w-4 h-4 text-gray-600 group-hover/item:text-gray-400" />
                          )}
                        </button>

                        {/* Title and click area */}
                        <button
                          onClick={() => onSelectLesson(lesson)}
                          className="flex-1 text-left min-w-0 flex items-center gap-2"
                        >
                          {isActive && (
                            <span className="flex items-center gap-0.5 shrink-0">
                              <span className="w-1 h-3 bg-indigo-400 animate-pulse rounded-full" />
                              <span className="w-1 h-2 bg-indigo-400 animate-pulse delay-75 rounded-full" />
                              <span className="w-1 h-4 bg-indigo-400 animate-pulse delay-150 rounded-full" />
                            </span>
                          )}

                          <span className="truncate leading-relaxed">{lesson.title}</span>
                        </button>

                        {/* Duration and Attachment Badges */}
                        <div className="flex items-center gap-1.5 shrink-0 ml-2">
                          {lesson.attachments.some((a) => a.type === 'pdf') && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 font-bold">
                              PDF
                            </span>
                          )}
                          {lesson.attachments.some((a) => a.type === 'zip' || a.type === 'code') && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">
                              CODE
                            </span>
                          )}
                          {lesson.durationSeconds > 0 && (
                            <span className="text-[10px] font-mono text-gray-400">
                              {formatDuration(lesson.durationSeconds)}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
