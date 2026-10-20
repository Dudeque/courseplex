'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ScannedLesson, ScannedAttachment, LessonNote, LessonChapter } from '@/types/course';
import { useCourseStore } from '@/store/useCourseStore';
import { apiUrl } from '@/lib/server-url';
import { parseSubtitleCues, SubtitleCue } from '@/lib/subtitles';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  FileText,
  Clock,
  Send,
  Trash2,
  Download,
  FolderDown,
  Paperclip,
  Tag,
  Eye,
  X,
  FileCode,
  FileArchive,
  Image as ImageIcon,
  Subtitles,
  Sparkles,
  Search,
  Quote,
  Loader2,
  ListOrdered,
  BookmarkPlus,
  Settings,
} from 'lucide-react';

interface NotesStudioProps {
  lesson: ScannedLesson;
  currentVideoTime: number;
  onSeek: (seconds: number) => void;
  onPauseVideo?: () => void;
  presetTimestamp?: number | null;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestampSeconds?: number;
}

function formatTime(secs: number) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function parseTimestampToken(token: string): number | null {
  const clean = token.replace(/^\[|\]$/g, '').trim();
  const parts = clean.split(':').map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

export function NotesStudio({
  lesson,
  currentVideoTime,
  onSeek,
  onPauseVideo,
  presetTimestamp,
}: NotesStudioProps) {
  const {
    libraryState,
    activeCourse,
    activeSubtitleUrl,
    addOrUpdateNote,
    deleteNote,
    setLessonChapters,
    exportCourseNotes,
    setFolderModalOpen,
  } = useCourseStore();

  const [activeTab, setActiveTab] = useState<'notes' | 'transcript' | 'ai' | 'attachments'>('notes');
  const [noteContent, setNoteContent] = useState('');
  const [noteTags, setNoteTags] = useState('');
  const [manualTimestamp, setManualTimestamp] = useState<number | null>(null);
  const [pauseWhileTyping, setPauseWhileTyping] = useState(true);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  // Transcript state
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptQuery, setTranscriptQuery] = useState('');
  const [autoScrollTranscript, setAutoScrollTranscript] = useState(true);
  const activeCueRef = useRef<HTMLDivElement | null>(null);

  // AI Tutor state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [quotedToast, setQuotedToast] = useState<string | null>(null);

  // Attachment Preview Modal
  const [previewAttachment, setPreviewAttachment] = useState<ScannedAttachment | null>(null);
  const [previewTextContent, setPreviewTextContent] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const activeTimestamp =
    presetTimestamp !== undefined && presetTimestamp !== null
      ? presetTimestamp
      : manualTimestamp !== null
        ? manualTimestamp
        : Math.round(currentVideoTime);

  const lessonNotes: LessonNote[] = useMemo(
    () => libraryState.notes[lesson.relativePath] || [],
    [libraryState.notes, lesson.relativePath]
  );
  const sortedNotes = useMemo(
    () => [...lessonNotes].sort((a, b) => a.timestampSeconds - b.timestampSeconds),
    [lessonNotes]
  );

  const lessonChapters: LessonChapter[] = useMemo(
    () => libraryState.chapters?.[lesson.relativePath] || [],
    [libraryState.chapters, lesson.relativePath]
  );

  // Load & parse subtitle cues whenever activeSubtitleUrl changes
  useEffect(() => {
    if (!activeSubtitleUrl) return;
    let cancelled = false;
    fetch(activeSubtitleUrl)
      .then((r) => r.text())
      .then((text) => {
        if (!cancelled) {
          setCues(parseSubtitleCues(text));
          setTranscriptLoading(false);
        }
      })
      .catch((err) => {
        console.warn('Could not load transcript cues:', err);
        if (!cancelled) setTranscriptLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeSubtitleUrl]);

  const activeCueIndex = useMemo(() => {
    if (cues.length === 0) return -1;
    for (let i = cues.length - 1; i >= 0; i--) {
      if (currentVideoTime >= cues[i].startSeconds && currentVideoTime <= cues[i].endSeconds + 1.5) {
        return i;
      }
    }
    return -1;
  }, [cues, currentVideoTime]);

  useEffect(() => {
    if (
      activeTab === 'transcript' &&
      autoScrollTranscript &&
      !transcriptQuery.trim() &&
      activeCueRef.current
    ) {
      activeCueRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeCueIndex, activeTab, autoScrollTranscript, transcriptQuery]);

  const filteredCues = useMemo(() => {
    if (!transcriptQuery.trim()) return cues;
    const q = transcriptQuery.toLowerCase();
    return cues.filter((c) => c.text.toLowerCase().includes(q));
  }, [cues, transcriptQuery]);

  const handleCaptureTimestamp = () => {
    setManualTimestamp(Math.round(currentVideoTime));
  };

  const handleCreateNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteContent.trim()) return;

    const tags = noteTags
      .split(',')
      .map((t) => t.trim().replace(/^#/, ''))
      .filter(Boolean);

    addOrUpdateNote({
      lessonPath: lesson.relativePath,
      coursePath: lesson.coursePath,
      timestampSeconds: activeTimestamp,
      contentMarkdown: noteContent.trim(),
      tags,
    });

    setNoteContent('');
    setNoteTags('');
    setManualTimestamp(null);
  };

  const handleQuoteCueToNote = (cue: SubtitleCue) => {
    addOrUpdateNote({
      lessonPath: lesson.relativePath,
      coursePath: lesson.coursePath,
      timestampSeconds: Math.round(cue.startSeconds),
      contentMarkdown: `> "${cue.text}"`,
      tags: ['transcript'],
    });
    setQuotedToast(`Quoted [${formatTime(cue.startSeconds)}] to Notes`);
    setTimeout(() => setQuotedToast(null), 2000);
  };

  const handleExportCourseNotes = async () => {
    try {
      setExportStatus('Exporting...');
      const result = await exportCourseNotes(lesson.coursePath);
      setExportStatus(`Saved ${result}!`);
      setTimeout(() => setExportStatus(null), 3000);
    } catch (err) {
      setExportStatus(err instanceof Error ? err.message : 'Export failed');
      setTimeout(() => setExportStatus(null), 3000);
    }
  };

  // Build transcript context helpers for AI
  const getTranscriptContext = () => {
    const nearby = cues
      .filter((c) => Math.abs(c.startSeconds - currentVideoTime) <= 95)
      .map((c) => `[${formatTime(c.startSeconds)}] ${c.text}`)
      .join('\n');

    const fullExcerpt = cues
      .filter((_, idx) => idx % Math.max(1, Math.floor(cues.length / 120)) === 0)
      .map((c) => `[${formatTime(c.startSeconds)}] ${c.text}`)
      .join('\n')
      .slice(0, 12000);

    const notesText = sortedNotes
      .map((n) => `[${formatTime(n.timestampSeconds)}] ${n.contentMarkdown.slice(0, 300)}`)
      .join('\n');

    return { nearby, fullExcerpt, notesText };
  };

  const handleAskAi = async (customPrompt?: string) => {
    const promptText = (customPrompt ?? aiInput).trim();
    if (!promptText || aiLoading) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: promptText,
      timestampSeconds: Math.round(currentVideoTime),
    };
    setChatMessages((prev) => [...prev, userMsg]);
    if (!customPrompt) setAiInput('');
    setAiLoading(true);
    setAiError(null);

    try {
      const { nearby, fullExcerpt, notesText } = getTranscriptContext();
      const res = await fetch(apiUrl('/api/local/ai'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'chat',
          courseTitle: activeCourse?.title || lesson.coursePath,
          lessonTitle: lesson.title,
          currentTimeFormatted: formatTime(currentVideoTime),
          nearbyTranscript: nearby,
          fullTranscriptExcerpt: fullExcerpt,
          notesText,
          question: promptText,
          history: chatMessages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'AI Tutor request failed');

      setChatMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: data.answer || 'No response received.',
          timestampSeconds: Math.round(currentVideoTime),
        },
      ]);
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : 'AI Tutor failed');
    } finally {
      setAiLoading(false);
    }
  };

  const handleGenerateSummary = async () => {
    if (aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const { nearby, fullExcerpt, notesText } = getTranscriptContext();
      const res = await fetch(apiUrl('/api/local/ai'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'summary',
          courseTitle: activeCourse?.title || lesson.coursePath,
          lessonTitle: lesson.title,
          nearbyTranscript: nearby,
          fullTranscriptExcerpt: fullExcerpt,
          notesText,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Summary generation failed');

      setChatMessages((prev) => [
        ...prev,
        {
          id: `sum-${Date.now()}`,
          role: 'assistant',
          content: data.markdown || 'Could not generate summary.',
          timestampSeconds: 0,
        },
      ]);
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : 'Summary generation failed');
    } finally {
      setAiLoading(false);
    }
  };

  const handleGenerateChapters = async () => {
    if (aiLoading) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const { nearby, fullExcerpt } = getTranscriptContext();
      const res = await fetch(apiUrl('/api/local/ai'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'chapters',
          courseTitle: activeCourse?.title || lesson.coursePath,
          lessonTitle: lesson.title,
          nearbyTranscript: nearby,
          fullTranscriptExcerpt: fullExcerpt,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Auto-chapters generation failed');

      if (Array.isArray(data.chapters) && data.chapters.length > 0) {
        setLessonChapters(lesson.relativePath, data.chapters);
      } else {
        throw new Error('AI returned no chapters');
      }
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : 'Auto-chapters failed');
    } finally {
      setAiLoading(false);
    }
  };

  const handleDownloadAttachment = (attachment: ScannedAttachment) => {
    const a = document.createElement('a');
    a.href = apiUrl(`/api/local/attachment?path=${encodeURIComponent(attachment.relativePath)}&download=1`);
    a.download = attachment.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleOpenPreview = async (attachment: ScannedAttachment) => {
    const ext = attachment.name.split('.').pop()?.toLowerCase();
    const isImage = ['jpg', 'jpeg', 'png', 'webp', 'svg', 'gif', 'bmp', 'avif'].includes(ext || '');

    if (ext === 'pdf' || isImage) {
      setPreviewUrl(apiUrl(`/api/local/attachment?path=${encodeURIComponent(attachment.relativePath)}`));
      setPreviewAttachment(attachment);
    } else if (
      ['md', 'txt', 'js', 'ts', 'json', 'py', 'html', 'css', 'jsx', 'tsx', 'sql', 'sh', 'yaml', 'yml'].includes(
        ext || ''
      )
    ) {
      try {
        const res = await fetch(
          apiUrl(`/api/local/attachment?path=${encodeURIComponent(attachment.relativePath)}`)
        );
        const text = await res.text();
        setPreviewTextContent(text);
        setPreviewAttachment(attachment);
      } catch (e) {
        console.warn('Could not load text preview:', e);
      }
    } else {
      handleDownloadAttachment(attachment);
    }
  };

  const closePreview = () => {
    setPreviewUrl(null);
    setPreviewTextContent(null);
    setPreviewAttachment(null);
  };

  return (
    <div className="bg-[#0f121e] border border-white/5 rounded-2xl flex flex-col h-full overflow-hidden">
      {/* Studio Header Navigation Tabs */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/5 bg-[#121626] gap-1">
        <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('notes')}
            className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold transition-all flex items-center gap-1 shrink-0 cursor-pointer ${
              activeTab === 'notes'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Notes ({sortedNotes.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('transcript')}
            className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold transition-all flex items-center gap-1 shrink-0 cursor-pointer ${
              activeTab === 'transcript'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Subtitles className="w-3.5 h-3.5" />
            <span>Transcript {cues.length > 0 ? `(${cues.length})` : ''}</span>
          </button>

          <button
            onClick={() => setActiveTab('ai')}
            className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold transition-all flex items-center gap-1 shrink-0 cursor-pointer ${
              activeTab === 'ai'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-indigo-300 hover:text-white hover:bg-indigo-500/10'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Tutor</span>
          </button>

          <button
            onClick={() => setActiveTab('attachments')}
            className={`px-2.5 py-1.5 rounded-xl text-[11px] font-semibold transition-all flex items-center gap-1 shrink-0 cursor-pointer ${
              activeTab === 'attachments'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Paperclip className="w-3.5 h-3.5" />
            <span>Files ({lesson.attachments.length})</span>
          </button>
        </div>

        {activeTab === 'notes' && (
          <button
            onClick={handleExportCourseNotes}
            className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-[10px] font-medium transition-all flex items-center gap-1 border border-white/5 shrink-0 cursor-pointer"
            title="Export all course notes to COURSE_NOTES.md"
          >
            <FolderDown className="w-3 h-3 text-indigo-400" />
            <span className="hidden sm:inline">{exportStatus || 'Export'}</span>
          </button>
        )}
      </div>

      {/* Tab 1: Lesson Notes Studio */}
      {activeTab === 'notes' && (
        <div className="flex-1 flex flex-col min-h-0">
          <form onSubmit={handleCreateNote} className="p-3.5 border-b border-white/5 bg-[#111422] space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCaptureTimestamp}
                  className="px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 border border-indigo-500/30 font-mono text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                  title="Capture current video timestamp"
                >
                  <Clock className="w-3 h-3" />
                  <span>[{formatTime(activeTimestamp)}]</span>
                </button>
                <span className="text-gray-500 text-[10px]">Press S on video for frame snapshot</span>
              </div>

              <label className="flex items-center gap-1.5 text-[11px] text-gray-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={pauseWhileTyping}
                  onChange={(e) => setPauseWhileTyping(e.target.checked)}
                  className="rounded bg-white/10 border-white/20 text-indigo-500 focus:ring-0 w-3.5 h-3.5"
                />
                <span>Pause</span>
              </label>
            </div>

            <textarea
              className="w-full bg-[#161a2c] border border-white/10 rounded-xl p-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/60 min-h-[64px] resize-none"
              placeholder="Write a note in Markdown... Press 'N' to open note editor or 'S' to snap a frame"
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              onFocus={() => {
                if (pauseWhileTyping && onPauseVideo) {
                  onPauseVideo();
                }
              }}
            />

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 flex-1">
                <Tag className="w-3 h-3 text-gray-500" />
                <input
                  type="text"
                  placeholder="Tags: #important, #react"
                  value={noteTags}
                  onChange={(e) => setNoteTags(e.target.value)}
                  className="w-full bg-transparent text-[11px] text-gray-300 placeholder-gray-600 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={!noteContent.trim()}
                className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold transition-all flex items-center gap-1 shadow-md shadow-indigo-600/30 cursor-pointer"
              >
                <span>Add Note</span>
                <Send className="w-3 h-3" />
              </button>
            </div>
          </form>

          <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
            {sortedNotes.length === 0 ? (
              <div className="py-10 text-center text-gray-500 text-xs flex flex-col items-center gap-2">
                <FileText className="w-8 h-8 text-gray-600" />
                <span>No notes for this lesson yet.</span>
                <span className="text-[11px] text-gray-600">
                  Press <kbd className="px-1.5 py-0.5 rounded bg-white/5 font-mono">S</kbd> while watching to snap a video frame directly into your notes!
                </span>
              </div>
            ) : (
              sortedNotes.map((note) => (
                <div
                  key={note.id}
                  className="group relative bg-[#131726] border border-white/5 hover:border-indigo-500/30 rounded-xl p-3 transition-all text-xs space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <button
                      onClick={() => onSeek(note.timestampSeconds)}
                      className="px-2 py-0.5 rounded-md bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 font-mono text-[11px] font-bold transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <Clock className="w-3 h-3" />
                      <span>[{formatTime(note.timestampSeconds)}]</span>
                    </button>

                    <button
                      onClick={() => deleteNote(note.id, lesson.relativePath)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-red-400 transition-all rounded cursor-pointer"
                      title="Delete note"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="prose prose-invert prose-xs max-w-none text-gray-200 [&_img]:rounded-lg [&_img]:border [&_img]:border-white/10 [&_img]:my-1.5">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {note.contentMarkdown}
                    </ReactMarkdown>
                  </div>

                  {note.tags && note.tags.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap pt-1">
                      {note.tags.map((t) => (
                        <span
                          key={t}
                          className="px-1.5 py-0.5 rounded bg-white/5 text-[10px] text-gray-400 font-mono"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Live Synchronized Transcript */}
      {activeTab === 'transcript' && (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="p-3 border-b border-white/5 bg-[#111422] flex items-center justify-between gap-2">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={transcriptQuery}
                onChange={(e) => setTranscriptQuery(e.target.value)}
                placeholder="Search spoken words in this lesson..."
                className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#161a2c] border border-white/10 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <label className="flex items-center gap-1.5 text-[11px] text-gray-400 cursor-pointer select-none shrink-0">
              <input
                type="checkbox"
                checked={autoScrollTranscript}
                onChange={(e) => setAutoScrollTranscript(e.target.checked)}
                className="rounded bg-white/10 border-white/20 text-indigo-500 focus:ring-0 w-3.5 h-3.5"
              />
              <span>Auto-scroll</span>
            </label>
          </div>

          {quotedToast && (
            <div className="px-3 py-1.5 bg-emerald-500/15 border-b border-emerald-500/20 text-emerald-300 text-[11px] font-medium text-center">
              {quotedToast}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {transcriptLoading ? (
              <div className="py-12 text-center text-gray-400 text-xs flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                <span>Parsing subtitles...</span>
              </div>
            ) : cues.length === 0 ? (
              <div className="py-12 text-center text-gray-500 text-xs flex flex-col items-center gap-2 px-4">
                <Subtitles className="w-8 h-8 text-gray-600" />
                <span>No `.srt` or `.vtt` subtitle file found for this video.</span>
                <span className="text-[11px] text-gray-600">
                  Place a matching `.srt` or `.vtt` file next to the video to unlock live interactive transcripts.
                </span>
              </div>
            ) : filteredCues.length === 0 ? (
              <div className="py-8 text-center text-gray-500 text-xs">
                No spoken lines match &ldquo;{transcriptQuery}&rdquo;.
              </div>
            ) : (
              filteredCues.map((cue, idx) => {
                const isActive =
                  !transcriptQuery.trim() &&
                  cues[activeCueIndex] &&
                  cues[activeCueIndex].startSeconds === cue.startSeconds;

                return (
                  <div
                    key={`${cue.startSeconds}-${idx}`}
                    ref={isActive ? activeCueRef : null}
                    onClick={() => onSeek(cue.startSeconds)}
                    className={`group flex items-start justify-between gap-2 p-2.5 rounded-xl border transition-all cursor-pointer text-xs ${
                      isActive
                        ? 'bg-indigo-600/20 border-indigo-500/50 text-white shadow-sm'
                        : 'bg-[#131726]/60 border-transparent hover:bg-white/5 text-gray-300'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <span
                        className={`font-mono text-[10px] px-1.5 py-0.5 rounded shrink-0 mt-0.5 ${
                          isActive
                            ? 'bg-indigo-500 text-white font-bold'
                            : 'bg-white/5 text-indigo-300'
                        }`}
                      >
                        {formatTime(cue.startSeconds)}
                      </span>
                      <p className="leading-relaxed break-words">{cue.text}</p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleQuoteCueToNote(cue);
                      }}
                      title="Quote this line into Notes"
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-lg bg-white/5 hover:bg-indigo-600 text-gray-400 hover:text-white transition-all shrink-0 cursor-pointer"
                    >
                      <Quote className="w-3 h-3" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Tab 3: AI Lesson Tutor & Auto-Chapters */}
      {activeTab === 'ai' && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Quick AI Actions Header */}
          <div className="p-3 border-b border-white/5 bg-[#111422] space-y-2">
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  disabled={aiLoading}
                  onClick={() =>
                    handleAskAi(
                      `Explain what the instructor just taught around [${formatTime(currentVideoTime)}] in simple terms.`
                    )
                  }
                  className="px-2.5 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/30 text-indigo-200 text-[11px] font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-40"
                >
                  <Sparkles className="w-3 h-3 text-indigo-400" />
                  <span>Explain [{formatTime(currentVideoTime)}]</span>
                </button>

                <button
                  type="button"
                  disabled={aiLoading}
                  onClick={handleGenerateSummary}
                  className="px-2.5 py-1 rounded-lg bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 text-purple-200 text-[11px] font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-40"
                >
                  <FileText className="w-3 h-3 text-purple-400" />
                  <span>Cheat-Sheet</span>
                </button>

                <button
                  type="button"
                  disabled={aiLoading}
                  onClick={handleGenerateChapters}
                  className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-200 text-[11px] font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-40"
                >
                  <ListOrdered className="w-3 h-3 text-emerald-400" />
                  <span>Auto-Chapters</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setFolderModalOpen(true)}
                title="Configure AI Provider & Model (Ollama / Gemini / OpenAI / Claude / Groq)"
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white cursor-pointer shrink-0"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Generated Chapters Horizontal Strip */}
            {lessonChapters.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-0.5 no-scrollbar">
                {lessonChapters.map((ch, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => onSeek(ch.startSeconds)}
                    title={ch.summary || ch.title}
                    className="px-2 py-1 rounded-lg bg-[#161a2c] hover:bg-indigo-600/30 border border-white/10 text-[10px] text-gray-200 flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <span className="font-mono text-indigo-400">{formatTime(ch.startSeconds)}</span>
                    <span className="truncate max-w-[120px]">{ch.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
            {aiError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-center justify-between gap-2">
                <span>{aiError}</span>
                <button
                  type="button"
                  onClick={() => setFolderModalOpen(true)}
                  className="px-2.5 py-1 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-white text-[11px] font-semibold shrink-0 cursor-pointer"
                >
                  AI Settings
                </button>
              </div>
            )}

            {chatMessages.length === 0 && !aiLoading ? (
              <div className="py-8 text-center text-gray-400 text-xs space-y-2 px-4">
                <Sparkles className="w-8 h-8 text-indigo-400 mx-auto" />
                <div className="font-semibold text-white">CoursePlex AI Lesson Tutor</div>
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  Ask anything about this lesson, click <strong>Explain [{formatTime(currentVideoTime)}]</strong> to break down what the instructor just said, or generate a <strong>Cheat-Sheet</strong> &amp; <strong>Auto-Chapters</strong>.
                </p>
              </div>
            ) : (
              chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`p-3 rounded-xl text-xs space-y-2 ${
                    msg.role === 'user'
                      ? 'bg-indigo-600/20 border border-indigo-500/30 text-indigo-100 ml-6'
                      : 'bg-[#131726] border border-white/5 text-gray-200 mr-2'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] text-gray-400">
                    <span className="font-bold uppercase tracking-wider text-indigo-400">
                      {msg.role === 'user' ? 'You' : 'AI Tutor'}
                    </span>
                    {msg.role === 'assistant' && (
                      <button
                        type="button"
                        onClick={() => {
                          addOrUpdateNote({
                            lessonPath: lesson.relativePath,
                            coursePath: lesson.coursePath,
                            timestampSeconds: msg.timestampSeconds ?? Math.round(currentVideoTime),
                            contentMarkdown: msg.content,
                            tags: ['ai-tutor'],
                          });
                          setQuotedToast('Saved AI response to Lesson Notes!');
                          setTimeout(() => setQuotedToast(null), 2000);
                        }}
                        className="flex items-center gap-1 text-indigo-300 hover:text-white cursor-pointer"
                        title="Save this response into Lesson Notes"
                      >
                        <BookmarkPlus className="w-3 h-3" />
                        <span>Save to Notes</span>
                      </button>
                    )}
                  </div>

                  <div className="prose prose-invert prose-xs max-w-none">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        p: ({ children }) => {
                          // Turn [MM:SS] tokens into clickable seek buttons
                          const processNode = (node: React.ReactNode): React.ReactNode => {
                            if (typeof node !== 'string') return node;
                            const parts = node.split(/(\[\d{1,2}:\d{2}(?::\d{2})?\])/g);
                            return parts.map((part, i) => {
                              if (/^\[\d{1,2}:\d{2}(?::\d{2})?\]$/.test(part)) {
                                const secs = parseTimestampToken(part);
                                if (secs !== null) {
                                  return (
                                    <button
                                      key={i}
                                      type="button"
                                      onClick={() => onSeek(secs)}
                                      className="inline-flex items-center px-1.5 py-0.2 mx-0.5 rounded bg-indigo-500/25 hover:bg-indigo-500/40 text-indigo-300 font-mono text-[11px] font-bold cursor-pointer"
                                    >
                                      {part}
                                    </button>
                                  );
                                }
                              }
                              return part;
                            });
                          };
                          return <p>{React.Children.map(children, processNode)}</p>;
                        },
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                </div>
              ))
            )}

            {aiLoading && (
              <div className="p-3 rounded-xl bg-[#131726] border border-white/5 text-xs text-indigo-300 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                <span>Thinking with lesson context...</span>
              </div>
            )}
          </div>

          {/* Chat Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleAskAi();
            }}
            className="p-3 border-t border-white/5 bg-[#111422] flex items-center gap-2"
          >
            <input
              type="text"
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              placeholder="Ask AI Tutor about this lesson..."
              className="flex-1 bg-[#161a2c] border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={aiLoading || !aiInput.trim()}
              className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      )}

      {/* Tab 4: Companion Files & Attachments */}
      {activeTab === 'attachments' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {lesson.attachments.length === 0 ? (
            <div className="py-12 text-center text-gray-500 text-xs flex flex-col items-center gap-2">
              <Paperclip className="w-8 h-8 text-gray-600" />
              <span>No companion files found for this lesson.</span>
              <span className="text-[11px] text-gray-600">
                Place .pdf, .zip, or .md files in the lesson folder to attach them automatically.
              </span>
            </div>
          ) : (
            lesson.attachments.map((att, idx) => {
              const isPdf = att.type === 'pdf';
              const isZip = att.type === 'zip';
              const isImage = att.type === 'image';

              return (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 rounded-xl bg-[#131726] border border-white/5 hover:border-indigo-500/30 transition-all"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-2 rounded-lg bg-white/5 text-indigo-400 shrink-0">
                      {isPdf ? (
                        <FileText className="w-4 h-4 text-red-400" />
                      ) : isZip ? (
                        <FileArchive className="w-4 h-4 text-amber-400" />
                      ) : isImage ? (
                        <ImageIcon className="w-4 h-4 text-purple-400" />
                      ) : (
                        <FileCode className="w-4 h-4 text-emerald-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white truncate">{att.name}</div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wider">
                        {att.type} attachment
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {[
                      'pdf',
                      'jpg',
                      'jpeg',
                      'png',
                      'webp',
                      'svg',
                      'gif',
                      'bmp',
                      'avif',
                      'md',
                      'txt',
                      'js',
                      'ts',
                      'json',
                      'py',
                      'html',
                      'css',
                      'jsx',
                      'tsx',
                      'sql',
                      'sh',
                      'yaml',
                      'yml',
                    ].includes(att.name.split('.').pop()?.toLowerCase() || '') && (
                      <button
                        onClick={() => handleOpenPreview(att)}
                        className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-medium transition-colors flex items-center gap-1 cursor-pointer"
                        title="Preview document"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Preview</span>
                      </button>
                    )}
                    <button
                      onClick={() => handleDownloadAttachment(att)}
                      className="px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-xs font-medium border border-indigo-500/30 transition-colors flex items-center gap-1 cursor-pointer"
                      title="Save / Download file"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Save</span>
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Attachment Preview Modal */}
      {previewAttachment && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="relative w-full max-w-4xl h-[80vh] bg-[#111422] border border-white/10 rounded-2xl flex flex-col overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-[#0d101a]">
              <div className="flex items-center gap-2 min-w-0">
                {previewAttachment.type === 'image' ? (
                  <ImageIcon className="w-4 h-4 text-purple-400 shrink-0" />
                ) : previewAttachment.type === 'pdf' ? (
                  <FileText className="w-4 h-4 text-red-400 shrink-0" />
                ) : (
                  <FileCode className="w-4 h-4 text-indigo-400 shrink-0" />
                )}
                <span className="text-sm font-bold text-white truncate">
                  {previewAttachment.name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownloadAttachment(previewAttachment)}
                  className="px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-xs font-medium border border-indigo-500/30 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Save</span>
                </button>
                <button
                  onClick={closePreview}
                  className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4 bg-[#0a0c14] flex items-center justify-center">
              {previewUrl ? (
                previewAttachment.type === 'image' ||
                ['jpg', 'jpeg', 'png', 'webp', 'svg', 'gif', 'bmp', 'avif'].includes(
                  previewAttachment.name.split('.').pop()?.toLowerCase() || ''
                ) ? (
                  <div className="w-full h-full flex items-center justify-center p-2 select-none">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt={previewAttachment.name}
                      className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
                    />
                  </div>
                ) : (
                  <iframe
                    src={previewUrl}
                    className="w-full h-full rounded-xl border border-white/5"
                    title={previewAttachment.name}
                  />
                )
              ) : previewTextContent !== null ? (
                <div className="w-full h-full overflow-auto prose prose-invert prose-sm max-w-none p-4 font-mono text-xs whitespace-pre-wrap">
                  {previewTextContent}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                  Loading preview...
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
