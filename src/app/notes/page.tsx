'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useCourseStore } from '@/store/useCourseStore';
import { LessonNote } from '@/types/course';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  FileText,
  Search,
  Tag,
  Clock,
  ExternalLink,
  BookOpen,
  Bookmark,
  Trash2,
  FolderDown,
} from 'lucide-react';

export default function GlobalNotesPage() {
  const { libraryState, deleteNote, selectCourse, scannedCourses } = useCourseStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedCoursePath, setSelectedCoursePath] = useState<string | null>(null);

  // Collect all notes across all courses
  const allNotes = useMemo(() => {
    const list: LessonNote[] = [];
    for (const notesList of Object.values(libraryState.notes)) {
      list.push(...notesList);
    }
    return list.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }, [libraryState.notes]);

  // Extract all unique tags
  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const note of allNotes) {
      if (note.tags) {
        for (const t of note.tags) set.add(t);
      }
    }
    return Array.from(set).sort();
  }, [allNotes]);

  // Filter notes
  const filteredNotes = useMemo(() => {
    return allNotes.filter((note) => {
      if (selectedTag && (!note.tags || !note.tags.includes(selectedTag))) {
        return false;
      }

      if (selectedCoursePath && note.coursePath !== selectedCoursePath) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesContent = note.contentMarkdown.toLowerCase().includes(q);
        const matchesCourse = note.coursePath.toLowerCase().includes(q);
        const matchesLesson = note.lessonPath.toLowerCase().includes(q);
        const matchesTags = note.tags?.some((t) => t.toLowerCase().includes(q));
        if (!matchesContent && !matchesCourse && !matchesLesson && !matchesTags) {
          return false;
        }
      }

      return true;
    });
  }, [allNotes, selectedTag, selectedCoursePath, searchQuery]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="p-6 md:p-10 space-y-8 max-w-7xl mx-auto">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <FileText className="w-8 h-8 text-indigo-400" />
            Global Notes &amp; Second Brain
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Search, filter, and jump directly into the exact second of any video lesson from your notes.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-gray-400 bg-white/5 px-3 py-1.5 rounded-xl border border-white/5">
            {filteredNotes.length} notes found
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            className="w-full bg-[#111422] border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/50"
            placeholder="Search within note contents, lesson titles, or tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Course Filter Dropdown */}
        <select
          value={selectedCoursePath || ''}
          onChange={(e) => setSelectedCoursePath(e.target.value || null)}
          className="w-full sm:w-auto bg-[#111422] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-gray-300 focus:outline-none cursor-pointer"
        >
          <option value="">All Courses</option>
          {scannedCourses.map((c) => (
            <option key={c.relativePath} value={c.relativePath}>
              {c.title}
            </option>
          ))}
        </select>
      </div>

      {/* Tag Filter Pills */}
      {allTags.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-gray-400 mr-1 flex items-center gap-1">
            <Tag className="w-3.5 h-3.5 text-indigo-400" />
            Tags:
          </span>
          <button
            onClick={() => setSelectedTag(null)}
            className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-all ${
              selectedTag === null
                ? 'bg-indigo-600 text-white'
                : 'bg-white/5 text-gray-400 hover:text-white'
            }`}
          >
            #all
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-all ${
                selectedTag === tag
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white/5 text-gray-400 hover:text-white'
              }`}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      {/* Notes Masonry / Grid */}
      {filteredNotes.length === 0 ? (
        <div className="p-16 text-center rounded-2xl bg-[#111422] border border-white/5 space-y-3">
          <FileText className="w-10 h-10 text-gray-600 mx-auto" />
          <h3 className="text-base font-bold text-white">No notes found</h3>
          <p className="text-xs text-gray-400 max-w-sm mx-auto">
            Take notes while watching any video by pressing &apos;N&apos; on your keyboard or using the Notes drawer.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredNotes.map((note) => {
            const courseTitle = note.coursePath.split('/').pop() || note.coursePath;
            const lessonTitle = note.lessonPath.split('/').pop() || note.lessonPath;

            return (
              <div
                key={note.id}
                className="group relative bg-[#111422] border border-white/5 hover:border-indigo-500/40 rounded-2xl p-4 flex flex-col justify-between gap-3 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/10"
              >
                <div className="space-y-2.5">
                  {/* Top metadata */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[10px] font-semibold text-indigo-400 uppercase tracking-wider block truncate">
                        {courseTitle}
                      </span>
                      <div className="text-xs font-medium text-gray-300 truncate">
                        {lessonTitle}
                      </div>
                    </div>

                    <button
                      onClick={() => deleteNote(note.id, note.lessonPath)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-red-400 transition-all rounded"
                      title="Delete note"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Markdown Body */}
                  <div className="prose prose-invert prose-xs max-w-none text-gray-200 line-clamp-6">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {note.contentMarkdown}
                    </ReactMarkdown>
                  </div>
                </div>

                {/* Bottom Bar: Timestamp seek link & Tags */}
                <div className="pt-3 border-t border-white/5 flex items-center justify-between gap-2">
                  <Link
                    href={`/course/${encodeURIComponent(note.coursePath)}?lesson=${encodeURIComponent(
                      note.lessonPath
                    )}&t=${note.timestampSeconds}`}
                    onClick={() => selectCourse(note.coursePath)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-mono text-[11px] font-bold transition-all hover:scale-105"
                  >
                    <Clock className="w-3 h-3" />
                    <span>Jump to [{formatTime(note.timestampSeconds)}]</span>
                  </Link>

                  {note.tags && note.tags.length > 0 && (
                    <div className="flex items-center gap-1 overflow-hidden">
                      {note.tags.slice(0, 2).map((t) => (
                        <span
                          key={t}
                          className="px-1.5 py-0.5 rounded bg-white/5 text-[9px] text-gray-400 font-mono truncate"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
