'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useCourseStore } from '@/store/useCourseStore';
import {
  Search,
  BookOpen,
  PlayCircle,
  FileText,
  FolderSync,
  HardDrive,
  Download,
  Flame,
  Layers,
  X,
  Lock,
} from 'lucide-react';
import { downloadBackupJson } from '@/lib/disk-sync';
import { lockDevice } from '@/lib/security';

interface CommandItem {
  id: string;
  category: 'Course' | 'Lesson' | 'Note' | 'Action';
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  action: () => void;
}

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const router = useRouter();
  const {
    scannedCourses,
    libraryState,
    connectDirectory,
    rescanDirectory,
    loadDemoMode,
    selectCourse,
    selectLesson,
  } = useCourseStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      } else if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  useEffect(() => {
    const handleOpenEvent = () => setIsOpen(true);
    window.addEventListener('open-command-palette', handleOpenEvent);
    return () => window.removeEventListener('open-command-palette', handleOpenEvent);
  }, []);

  const items: CommandItem[] = useMemo(() => {
    const results: CommandItem[] = [];

    // System Actions
    results.push({
      id: 'action-mount',
      category: 'Action',
      title: 'Mount Local Courses Folder',
      subtitle: 'Connect your hard drive via File System Access API',
      icon: <HardDrive className="w-4 h-4 text-indigo-400" />,
      action: async () => {
        setIsOpen(false);
        try {
          await connectDirectory();
        } catch (e) {
          console.warn('Mount error:', e);
        }
      },
    });

    results.push({
      id: 'action-rescan',
      category: 'Action',
      title: 'Rescan Connected Folder',
      subtitle: 'Scan for newly added video files or companion notes',
      icon: <FolderSync className="w-4 h-4 text-emerald-400" />,
      action: async () => {
        setIsOpen(false);
        await rescanDirectory();
      },
    });

    results.push({
      id: 'action-demo',
      category: 'Action',
      title: 'Explore Demo Library',
      subtitle: 'Load sample courses, video streams, notes, and stats',
      icon: <Layers className="w-4 h-4 text-pink-400" />,
      action: () => {
        setIsOpen(false);
        loadDemoMode();
        router.push('/');
      },
    });

    results.push({
      id: 'action-export-backup',
      category: 'Action',
      title: 'Export Backup JSON',
      subtitle: 'Download complete state and notes as JSON',
      icon: <Download className="w-4 h-4 text-amber-400" />,
      action: () => {
        setIsOpen(false);
        downloadBackupJson(libraryState);
      },
    });

    results.push({
      id: 'action-stats',
      category: 'Action',
      title: 'View Study Streaks & Analytics',
      subtitle: 'GitHub-style heatmap and velocity stats',
      icon: <Flame className="w-4 h-4 text-orange-400" />,
      action: () => {
        setIsOpen(false);
        router.push('/stats');
      },
    });

    results.push({
      id: 'action-lock',
      category: 'Action',
      title: 'Lock CoursePlex',
      subtitle: 'Lock session and require passcode to re-enter',
      icon: <Lock className="w-4 h-4 text-red-400" />,
      action: () => {
        setIsOpen(false);
        lockDevice();
        window.dispatchEvent(new CustomEvent('courseplex-lock-app'));
      },
    });

    // Courses
    for (const course of scannedCourses) {
      results.push({
        id: `course-${course.relativePath}`,
        category: 'Course',
        title: course.title,
        subtitle: `${course.totalLessons} lessons • ${course.clusterName || 'Course'}`,
        icon: <BookOpen className="w-4 h-4 text-blue-400" />,
        action: () => {
          setIsOpen(false);
          selectCourse(course.relativePath);
          router.push(`/course/${encodeURIComponent(course.relativePath)}`);
        },
      });

      // Lessons
      for (const mod of course.modules) {
        for (const lesson of mod.lessons) {
          results.push({
            id: `lesson-${lesson.relativePath}`,
            category: 'Lesson',
            title: lesson.title,
            subtitle: `${course.title} • ${mod.title}`,
            icon: <PlayCircle className="w-4 h-4 text-purple-400" />,
            action: async () => {
              setIsOpen(false);
              selectCourse(course.relativePath);
              await selectLesson(lesson);
              router.push(`/course/${encodeURIComponent(course.relativePath)}?lesson=${encodeURIComponent(lesson.relativePath)}`);
            },
          });
        }
      }
    }

    // Notes
    for (const [lessonPath, notesList] of Object.entries(libraryState.notes)) {
      for (const note of notesList) {
        const minutes = Math.floor(note.timestampSeconds / 60);
        const seconds = Math.floor(note.timestampSeconds % 60);
        const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        results.push({
          id: `note-${note.id}`,
          category: 'Note',
          title: `[${timeStr}] ${note.contentMarkdown.slice(0, 60)}...`,
          subtitle: `Note in ${note.coursePath}`,
          icon: <FileText className="w-4 h-4 text-teal-400" />,
          action: () => {
            setIsOpen(false);
            selectCourse(note.coursePath);
            router.push(`/course/${encodeURIComponent(note.coursePath)}?lesson=${encodeURIComponent(lessonPath)}&t=${note.timestampSeconds}`);
          },
        });
      }
    }

    return results;
  }, [scannedCourses, libraryState, connectDirectory, rescanDirectory, loadDemoMode, selectCourse, selectLesson, router]);

  const filteredItems = useMemo(() => {
    if (!query.trim()) {
      return items.slice(0, 15);
    }
    const q = query.toLowerCase();
    return items
      .filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          (item.subtitle && item.subtitle.toLowerCase().includes(q)) ||
          item.category.toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [items, query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredItems.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filteredItems.length) % Math.max(1, filteredItems.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const item = filteredItems[selectedIndex];
      if (item) {
        item.action();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 px-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
      <div
        className="relative w-full max-w-2xl bg-[#111420] border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-white/10 gap-3">
          <Search className="w-5 h-5 text-gray-400 shrink-0" />
          <input
            type="text"
            className="w-full bg-transparent text-white placeholder-gray-500 text-base focus:outline-none"
            placeholder="Search courses, lessons, notes, or actions... (Cmd+K)"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={handleKeyDown}
            autoFocus
          />
          <button
            onClick={() => setIsOpen(false)}
            className="p-1 rounded-md text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-96 overflow-y-auto p-2 space-y-1">
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">
              No results found for &quot;{query}&quot;
            </div>
          ) : (
            filteredItems.map((item, index) => {
              const isSelected = index === selectedIndex;
              return (
                <button
                  key={item.id}
                  onClick={item.action}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-left transition-all ${
                    isSelected
                      ? 'bg-indigo-600/30 text-white border border-indigo-500/30'
                      : 'text-gray-300 hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-lg bg-white/5 shrink-0">{item.icon}</div>
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate text-white">
                        {item.title}
                      </div>
                      {item.subtitle && (
                        <div className="text-xs text-gray-400 truncate">
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-white/5 text-gray-400 shrink-0 ml-2">
                    {item.category}
                  </span>
                </button>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="flex items-center justify-between px-4 py-2 bg-black/40 border-t border-white/5 text-[11px] text-gray-400">
          <div className="flex items-center gap-4">
            <span>
              <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-[10px] mr-1">↑</kbd>
              <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-[10px] mr-1">↓</kbd>
              Navigate
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-[10px] mr-1">↵</kbd>
              Select
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-[10px] mr-1">esc</kbd>
              Close
            </span>
          </div>
          <span className="text-gray-500">CoursePlex Spotlight</span>
        </div>
      </div>
    </div>
  );
}
