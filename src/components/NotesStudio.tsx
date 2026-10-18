'use client';

import React, { useState, useEffect } from 'react';
import { ScannedLesson, ScannedAttachment, LessonNote } from '@/types/course';
import { useCourseStore } from '@/store/useCourseStore';
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
  ExternalLink,
  Tag,
  Check,
  Eye,
  X,
  FileCode,
  FileArchive,
  Image as ImageIcon,
} from 'lucide-react';

interface NotesStudioProps {
  lesson: ScannedLesson;
  currentVideoTime: number;
  onSeek: (seconds: number) => void;
  onPauseVideo?: () => void;
  presetTimestamp?: number | null;
}

export function NotesStudio({
  lesson,
  currentVideoTime,
  onSeek,
  onPauseVideo,
  presetTimestamp,
}: NotesStudioProps) {
  const { libraryState, addOrUpdateNote, deleteNote, exportCourseNotes } = useCourseStore();

  const [activeTab, setActiveTab] = useState<'notes' | 'attachments'>('notes');
  const [noteContent, setNoteContent] = useState('');
  const [noteTags, setNoteTags] = useState('');
  const [manualTimestamp, setManualTimestamp] = useState<number | null>(null);
  const [pauseWhileTyping, setPauseWhileTyping] = useState(true);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

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

  const lessonNotes: LessonNote[] = libraryState.notes[lesson.relativePath] || [];
  const sortedNotes = [...lessonNotes].sort(
    (a, b) => a.timestampSeconds - b.timestampSeconds
  );

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

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

  // Resolve File object whether from in-memory File, FileSystemFileHandle, or rootDirHandle
  const resolveAttachmentFile = async (attachment: ScannedAttachment): Promise<File | null> => {
    if (attachment.file) return attachment.file;
    if (attachment.handle) {
      try {
        return await attachment.handle.getFile();
      } catch (e) {
        console.warn('Could not read file from attachment handle:', e);
      }
    }
    const rootHandle = useCourseStore.getState().rootDirHandle;
    if (rootHandle) {
      try {
        const { getFileHandleByPath } = await import('@/lib/fs-handle');
        const handle = await getFileHandleByPath(rootHandle, attachment.relativePath);
        if (handle) {
          return await handle.getFile();
        }
      } catch (e) {
        console.warn('Could not resolve file by path:', e);
      }
    }
    return null;
  };

  const handleDownloadAttachment = async (attachment: ScannedAttachment) => {
    const file = await resolveAttachmentFile(attachment);
    if (!file) {
      alert('Could not access this file. Please re-mount your course folder.');
      return;
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = attachment.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Preview attachment handler
  const handleOpenPreview = async (attachment: ScannedAttachment) => {
    const file = await resolveAttachmentFile(attachment);
    if (!file) {
      alert('Could not access this file. Please re-mount your course folder.');
      return;
    }

    const ext = attachment.name.split('.').pop()?.toLowerCase();
    const isImage = ['jpg', 'jpeg', 'png', 'webp', 'svg', 'gif', 'bmp', 'avif'].includes(ext || '');

    if (ext === 'pdf' || isImage) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setPreviewAttachment(attachment);
    } else if (['md', 'txt', 'js', 'ts', 'json', 'py', 'html', 'css', 'jsx', 'tsx', 'sql', 'sh', 'yaml', 'yml'].includes(ext || '')) {
      const text = await file.text();
      setPreviewTextContent(text);
      setPreviewAttachment(attachment);
    } else {
      // Direct download for archives / non-previewable files
      handleDownloadAttachment(attachment);
    }
  };

  const closePreview = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setPreviewTextContent(null);
    setPreviewAttachment(null);
  };

  return (
    <div className="bg-[#0f121e] border border-white/5 rounded-2xl flex flex-col h-full overflow-hidden">
      {/* Studio Header Navigation Tabs */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5 bg-[#121626]">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('notes')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === 'notes'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Notes ({sortedNotes.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('attachments')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
              activeTab === 'attachments'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Paperclip className="w-3.5 h-3.5" />
            <span>Attachments ({lesson.attachments.length})</span>
          </button>
        </div>

        {activeTab === 'notes' && (
          <button
            onClick={handleExportCourseNotes}
            className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-[11px] font-medium transition-all flex items-center gap-1 border border-white/5"
            title="Export all course notes to COURSE_NOTES.md on disk"
          >
            <FolderDown className="w-3 h-3 text-indigo-400" />
            <span>{exportStatus || 'Export .md'}</span>
          </button>
        )}
      </div>

      {/* Tab 1: Lesson Notes Studio */}
      {activeTab === 'notes' && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Note Input Box */}
          <form onSubmit={handleCreateNote} className="p-4 border-b border-white/5 bg-[#111422] space-y-3">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCaptureTimestamp}
                  className="px-2.5 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 border border-indigo-500/30 font-mono text-[11px] font-semibold flex items-center gap-1 transition-colors"
                  title="Capture current video timestamp"
                >
                  <Clock className="w-3 h-3" />
                  <span>[{formatTime(activeTimestamp)}]</span>
                </button>
                <span className="text-gray-500 text-[11px]">Timestamp stamp</span>
              </div>

              {/* Pause while typing toggle */}
              <label className="flex items-center gap-1.5 text-[11px] text-gray-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={pauseWhileTyping}
                  onChange={(e) => setPauseWhileTyping(e.target.checked)}
                  className="rounded bg-white/10 border-white/20 text-indigo-500 focus:ring-0 w-3.5 h-3.5"
                />
                <span>Pause while typing</span>
              </label>
            </div>

            <textarea
              className="w-full bg-[#161a2c] border border-white/10 rounded-xl p-2.5 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/60 min-h-[70px] resize-none"
              placeholder="Write a note in Markdown... Press 'N' to open note editor anytime"
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
                className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold transition-all flex items-center gap-1 shadow-md shadow-indigo-600/30"
              >
                <span>Add Note</span>
                <Send className="w-3 h-3" />
              </button>
            </div>
          </form>

          {/* Rendered Notes List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {sortedNotes.length === 0 ? (
              <div className="py-12 text-center text-gray-500 text-xs flex flex-col items-center gap-2">
                <FileText className="w-8 h-8 text-gray-600" />
                <span>No notes for this lesson yet.</span>
                <span className="text-[11px] text-gray-600">
                  Take notes and timestamp key moments to jump straight back!
                </span>
              </div>
            ) : (
              sortedNotes.map((note) => (
                <div
                  key={note.id}
                  className="group relative bg-[#131726] border border-white/5 hover:border-indigo-500/30 rounded-xl p-3.5 transition-all text-xs space-y-2"
                >
                  <div className="flex items-center justify-between">
                    {/* Timestamp seek button */}
                    <button
                      onClick={() => onSeek(note.timestampSeconds)}
                      className="px-2 py-0.5 rounded-md bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-300 border border-indigo-500/30 font-mono text-[11px] font-bold transition-colors flex items-center gap-1"
                    >
                      <Clock className="w-3 h-3" />
                      <span>[{formatTime(note.timestampSeconds)}]</span>
                    </button>

                    <button
                      onClick={() => deleteNote(note.id, lesson.relativePath)}
                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-500 hover:text-red-400 transition-all rounded"
                      title="Delete note"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Markdown Content */}
                  <div className="prose prose-invert prose-xs max-w-none text-gray-200">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {note.contentMarkdown}
                    </ReactMarkdown>
                  </div>

                  {/* Tags */}
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

      {/* Tab 2: Companion Files & Attachments */}
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
                      <div className="text-xs font-semibold text-white truncate">
                        {att.name}
                      </div>
                      <div className="text-[10px] text-gray-400 uppercase tracking-wider">
                        {att.type} attachment
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {['pdf', 'jpg', 'jpeg', 'png', 'webp', 'svg', 'gif', 'bmp', 'avif', 'md', 'txt', 'js', 'ts', 'json', 'py', 'html', 'css', 'jsx', 'tsx', 'sql', 'sh', 'yaml', 'yml'].includes(
                      att.name.split('.').pop()?.toLowerCase() || ''
                    ) && (
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
            {/* Modal Header */}
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
                  title="Save / Download file"
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

            {/* Modal Content */}
            <div className="flex-1 overflow-auto p-4 bg-[#0a0c14] flex items-center justify-center">
              {previewUrl ? (
                previewAttachment.type === 'image' || ['jpg', 'jpeg', 'png', 'webp', 'svg', 'gif', 'bmp', 'avif'].includes(previewAttachment.name.split('.').pop()?.toLowerCase() || '') ? (
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
