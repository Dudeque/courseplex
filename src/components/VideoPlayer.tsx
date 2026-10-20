'use client';

import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { ScannedLesson } from '@/types/course';
import { useCourseStore } from '@/store/useCourseStore';
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Tv,
  Bookmark,
  Edit3,
  Subtitles,
  ArrowRight,
  PictureInPicture,
  Camera,
  Sparkles,
} from 'lucide-react';

interface VideoPlayerProps {
  lesson: ScannedLesson;
  initialTime?: number;
  seekRequest?: { time: number; nonce: number } | null;
  onTimeChange?: (seconds: number) => void;
  onNextLesson?: () => void;
  hasNextLesson?: boolean;
  onTakeNote?: (timestampSeconds: number) => void;
  onDropBookmark?: (timestampSeconds: number) => void;
}

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5];

function formatTime(secs: number) {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function VideoPlayer({
  lesson,
  initialTime = 0,
  seekRequest,
  onTimeChange,
  onNextLesson,
  hasNextLesson = false,
  onTakeNote,
  onDropBookmark,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const {
    activeVideoUrl,
    activeSubtitleUrl,
    playbackSpeed,
    setPlaybackSpeed,
    isTheaterMode,
    toggleTheaterMode,
    updateLessonProgress,
    logStudySession,
    libraryState,
    addOrUpdateNote,
  } = useCourseStore();

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(lesson.durationSeconds || 0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isSpeedMenuOpen, setIsSpeedMenuOpen] = useState(false);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);
  const [notification, setNotification] = useState<string | null>(null);
  const [autoAdvanceCountdown, setAutoAdvanceCountdown] = useState<number | null>(null);

  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSaveTimeRef = useRef<number>(0);
  const studySessionStartRef = useRef<number>(0);
  const studySessionAccumulatedRef = useRef<number>(0);

  const lessonNotes = useMemo(
    () => libraryState.notes[lesson.relativePath] || [],
    [libraryState.notes, lesson.relativePath]
  );

  const lessonChapters = useMemo(
    () => libraryState.chapters?.[lesson.relativePath] || [],
    [libraryState.chapters, lesson.relativePath]
  );

  const activeChapter = useMemo(() => {
    if (lessonChapters.length === 0) return null;
    let current = lessonChapters[0];
    for (const ch of lessonChapters) {
      if (currentTime >= ch.startSeconds) {
        current = ch;
      } else {
        break;
      }
    }
    return current;
  }, [lessonChapters, currentTime]);

  const showNotification = useCallback((msg: string) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification((curr) => (curr === msg ? null : curr));
    }, 2200);
  }, []);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      const dur = Math.round(video.duration || 0);
      setDuration(dur);
      if (initialTime > 0 && initialTime < dur) {
        video.currentTime = initialTime;
        setCurrentTime(initialTime);
        onTimeChange?.(initialTime);
      }
    };

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [initialTime, lesson.relativePath, onTimeChange]);

  // Respond immediately to external seek requests (from Notes, Transcript, AI Tutor, Chapters)
  useEffect(() => {
    if (!seekRequest || !videoRef.current) return;
    const video = videoRef.current;
    const target = Math.max(0, seekRequest.time);
    video.currentTime = target;
    setCurrentTime(target);
    onTimeChange?.(target);
  }, [seekRequest, onTimeChange]);

  useEffect(() => {
    const currentLessonPath = lesson.relativePath;
    const currentCoursePath = lesson.coursePath;
    studySessionStartRef.current = Date.now();
    studySessionAccumulatedRef.current = 0;

    return () => {
      const realSeconds = studySessionAccumulatedRef.current;
      if (realSeconds >= 10) {
        const realMinutes = realSeconds / 60;
        const contentMinutes = (realSeconds * playbackSpeed) / 60;
        logStudySession(currentCoursePath, currentLessonPath, realMinutes, contentMinutes);
      }
    };
  }, [lesson.relativePath, lesson.coursePath, playbackSpeed, logStudySession]);

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;

    const curr = video.currentTime;
    const dur = video.duration || duration;
    setCurrentTime(curr);
    onTimeChange?.(curr);

    studySessionAccumulatedRef.current += 0.25;

    const now = Date.now();
    if (now - lastSaveTimeRef.current >= 3000) {
      lastSaveTimeRef.current = now;
      updateLessonProgress(lesson.coursePath, lesson.relativePath, curr, dur);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    updateLessonProgress(lesson.coursePath, lesson.relativePath, duration, duration, true);

    if (hasNextLesson && onNextLesson) {
      setAutoAdvanceCountdown(5);
    }
  };

  useEffect(() => {
    if (autoAdvanceCountdown === null) return;
    const timer = setTimeout(() => {
      if (autoAdvanceCountdown <= 1) {
        setAutoAdvanceCountdown(null);
        if (onNextLesson) onNextLesson();
      } else {
        setAutoAdvanceCountdown((prev) => (prev !== null ? prev - 1 : null));
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [autoAdvanceCountdown, onNextLesson]);

  const togglePlay = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video.play().catch(console.warn);
      setIsPlaying(true);
      setAutoAdvanceCountdown(null);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  }, []);

  const seekRelative = useCallback(
    (deltaSeconds: number) => {
      const video = videoRef.current;
      if (!video) return;
      const next = Math.max(0, Math.min(video.duration || duration, video.currentTime + deltaSeconds));
      video.currentTime = next;
      setCurrentTime(next);
      onTimeChange?.(next);
      showNotification(`${deltaSeconds > 0 ? '+' : ''}${deltaSeconds}s`);
    },
    [duration, onTimeChange, showNotification]
  );

  const toggleMute = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  }, []);

  const changeSpeedByStep = useCallback(
    (step: number) => {
      const currentIndex = SPEED_OPTIONS.indexOf(playbackSpeed);
      const newIndex = Math.max(
        0,
        Math.min(SPEED_OPTIONS.length - 1, (currentIndex !== -1 ? currentIndex : 2) + step)
      );
      const newSpeed = SPEED_OPTIONS[newIndex];
      setPlaybackSpeed(newSpeed);
      showNotification(`${newSpeed}x speed`);
    },
    [playbackSpeed, setPlaybackSpeed, showNotification]
  );

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(console.warn);
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(console.warn);
      setIsFullscreen(false);
    }
  }, []);

  const togglePiP = useCallback(async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (video.requestPictureInPicture) {
        await video.requestPictureInPicture();
      }
    } catch (e) {
      console.warn('PiP not supported or failed:', e);
    }
  }, []);

  const captureFrameSnapshot = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      showNotification('Video frame not ready');
      return;
    }
    try {
      const targetWidth = Math.min(640, video.videoWidth);
      const scale = targetWidth / video.videoWidth;
      const targetHeight = Math.round(video.videoHeight * scale);

      const canvas = document.createElement('canvas');
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
      const t = Math.round(video.currentTime);

      addOrUpdateNote({
        lessonPath: lesson.relativePath,
        coursePath: lesson.coursePath,
        timestampSeconds: t,
        contentMarkdown: `📸 **Frame Snapshot (${formatTime(t)})**\n\n![Snapshot at ${formatTime(t)}](${dataUrl})`,
        tags: ['snapshot'],
      });

      showNotification(`📸 Frame captured to Notes at ${formatTime(t)}`);
    } catch (err) {
      console.warn('Snapshot capture failed:', err);
      showNotification('Could not capture frame snapshot');
    }
  }, [addOrUpdateNote, lesson.coursePath, lesson.relativePath, showNotification]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'j':
          e.preventDefault();
          seekRelative(-10);
          break;
        case 'l':
          e.preventDefault();
          seekRelative(10);
          break;
        case '[':
          e.preventDefault();
          changeSpeedByStep(-1);
          break;
        case ']':
          e.preventDefault();
          changeSpeedByStep(1);
          break;
        case 'm':
          e.preventDefault();
          toggleMute();
          break;
        case 'f':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'b':
          e.preventDefault();
          if (videoRef.current && onDropBookmark) {
            const t = Math.round(videoRef.current.currentTime);
            onDropBookmark(t);
            showNotification(`Bookmark dropped at ${formatTime(t)}`);
          }
          break;
        case 'n':
          e.preventDefault();
          if (videoRef.current && onTakeNote) {
            const t = Math.round(videoRef.current.currentTime);
            onTakeNote(t);
            showNotification(`Note opened at ${formatTime(t)}`);
          }
          break;
        case 's':
          e.preventDefault();
          captureFrameSnapshot();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    togglePlay,
    seekRelative,
    changeSpeedByStep,
    toggleMute,
    toggleFullscreen,
    onDropBookmark,
    onTakeNote,
    captureFrameSnapshot,
    showNotification,
  ]);

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
      }, 3000);
    }
  };

  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      className={`relative w-full bg-black overflow-hidden select-none group ${
        isTheaterMode ? 'aspect-21/9 max-h-[85vh]' : 'aspect-video max-h-[75vh]'
      } rounded-2xl shadow-2xl border border-white/5`}
    >
      {activeVideoUrl ? (
        <video
          ref={videoRef}
          src={activeVideoUrl}
          crossOrigin="anonymous"
          className="w-full h-full object-contain"
          playsInline
          onTimeUpdate={handleTimeUpdate}
          onEnded={handleEnded}
          onClick={togglePlay}
        >
          {activeSubtitleUrl && subtitlesEnabled && (
            <track
              src={activeSubtitleUrl}
              kind="subtitles"
              srcLang="en"
              label="Subtitles"
              default
            />
          )}
        </video>
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center bg-[#0d101a] text-gray-400 p-8 text-center">
          <Tv className="w-16 h-16 text-indigo-500/40 mb-3" />
          <h3 className="text-lg font-bold text-white mb-1">{lesson.title}</h3>
          <p className="text-xs text-gray-400 max-w-md">
            {lesson.isResourceOnly
              ? 'This is a reading / reference lesson. Preview companion documents in the side panel.'
              : 'Select a video file to begin streaming.'}
          </p>
        </div>
      )}

      {notification && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-xl bg-black/80 backdrop-blur-md border border-white/10 text-white text-xs font-semibold shadow-xl animate-in fade-in duration-150 z-30">
          {notification}
        </div>
      )}

      {autoAdvanceCountdown !== null && (
        <div className="absolute inset-0 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center gap-4 z-40 text-center animate-in fade-in">
          <div className="w-16 h-16 rounded-full border-4 border-indigo-500 border-t-transparent animate-spin flex items-center justify-center text-xl font-bold text-white">
            {autoAdvanceCountdown}
          </div>
          <div>
            <div className="text-xs text-indigo-400 uppercase tracking-wider font-semibold">
              Up Next
            </div>
            <div className="text-lg font-bold text-white max-w-md mt-1">
              Advancing to next lesson in {autoAdvanceCountdown}s...
            </div>
          </div>
          <div className="flex items-center gap-3 mt-2">
            <button
              onClick={() => setAutoAdvanceCountdown(null)}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-all"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                setAutoAdvanceCountdown(null);
                if (onNextLesson) onNextLesson();
              }}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all flex items-center gap-1.5 shadow-lg shadow-indigo-600/30"
            >
              <span>Play Now</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {!isPlaying && activeVideoUrl && (
        <div
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/30 backdrop-blur-xs cursor-pointer z-10"
        >
          <div className="w-20 h-20 rounded-full bg-indigo-600/90 text-white flex items-center justify-center shadow-2xl shadow-indigo-600/60 transform hover:scale-110 transition-transform">
            <Play className="w-10 h-10 ml-1 fill-current" />
          </div>
        </div>
      )}

      {/* Controls Overlay Bar */}
      <div
        className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/95 via-black/75 to-transparent p-4 flex flex-col gap-2 transition-opacity duration-300 z-20 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Scrubber Progress Bar with Chapter Ticks & Note/Bookmark Markers */}
        <div
          className="relative w-full h-3 group/scrub cursor-pointer py-1 flex items-center"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickPos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            if (videoRef.current && duration > 0) {
              const next = clickPos * duration;
              videoRef.current.currentTime = next;
              setCurrentTime(next);
              onTimeChange?.(next);
            }
          }}
        >
          <div className="relative w-full h-1.5 bg-white/20 rounded-full overflow-visible group-hover/scrub:h-2.5 transition-all">
            <div
              className="h-full bg-indigo-500 rounded-full transition-all relative"
              style={{ width: `${progressPercentage}%` }}
            />

            {/* AI Chapter Dividers */}
            {duration > 0 &&
              lessonChapters.map((ch, idx) => {
                if (ch.startSeconds <= 0 || ch.startSeconds >= duration) return null;
                const pct = (ch.startSeconds / duration) * 100;
                return (
                  <div
                    key={`ch-${idx}`}
                    style={{ left: `${pct}%` }}
                    title={`Chapter: ${ch.title} (${formatTime(ch.startSeconds)})`}
                    className="absolute top-0 bottom-0 w-0.5 bg-black/80 z-10"
                  />
                );
              })}

            {/* Note & Bookmark Markers */}
            {duration > 0 &&
              lessonNotes.map((note) => {
                const pct = Math.min(99.5, Math.max(0.5, (note.timestampSeconds / duration) * 100));
                const isBookmark = note.isBookmarkOnly;
                const previewText = isBookmark
                  ? 'Bookmark'
                  : note.contentMarkdown.replace(/!\[.*?\]\(.*?\)/g, '[Snapshot]').slice(0, 60);
                return (
                  <button
                    key={note.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (videoRef.current) {
                        videoRef.current.currentTime = note.timestampSeconds;
                        setCurrentTime(note.timestampSeconds);
                        onTimeChange?.(note.timestampSeconds);
                      }
                    }}
                    style={{ left: `${pct}%` }}
                    title={`[${formatTime(note.timestampSeconds)}] ${previewText}`}
                    className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full border border-black shadow-md transform hover:scale-150 transition-transform z-20 cursor-pointer ${
                      isBookmark ? 'bg-amber-400' : 'bg-emerald-400'
                    }`}
                  />
                );
              })}
          </div>
        </div>

        {/* Lower Action Controls Bar */}
        <div className="flex items-center justify-between gap-2 text-white text-xs">
          {/* Left Controls: Play, Skip, Time, Active Chapter, Volume */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={togglePlay}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              title={isPlaying ? 'Pause (Space / K)' : 'Play (Space / K)'}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-current" />}
            </button>

            <button
              onClick={() => seekRelative(-10)}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors text-gray-300 hover:text-white cursor-pointer"
              title="Seek -10s (J)"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={() => seekRelative(10)}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors text-gray-300 hover:text-white cursor-pointer"
              title="Seek +10s (L)"
            >
              <RotateCw className="w-4 h-4" />
            </button>

            <div className="font-mono text-xs text-gray-300 px-1.5 shrink-0">
              <span>{formatTime(currentTime)}</span>
              <span className="text-gray-600 mx-1">/</span>
              <span>{formatTime(duration)}</span>
            </div>

            {activeChapter && (
              <div className="hidden md:flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-500/20 border border-indigo-500/30 text-indigo-200 text-[11px] truncate max-w-[200px]">
                <Sparkles className="w-3 h-3 text-indigo-400 shrink-0" />
                <span className="truncate">{activeChapter.title}</span>
              </div>
            )}

            <div className="hidden sm:flex items-center gap-1.5 ml-1 group/vol">
              <button
                onClick={toggleMute}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-gray-300 hover:text-white cursor-pointer"
                title="Mute (M)"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-red-400" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setVolume(val);
                  setIsMuted(val === 0);
                  if (videoRef.current) {
                    videoRef.current.volume = val;
                    videoRef.current.muted = val === 0;
                  }
                }}
                className="w-16 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer accent-indigo-500"
              />
            </div>
          </div>

          {/* Right Controls: Snapshot, Bookmark, Note, Subtitles, Speed, PiP, Theater, Fullscreen */}
          <div className="flex items-center gap-1 shrink-0">
            {/* Frame Snapshot into Notes */}
            <button
              onClick={captureFrameSnapshot}
              className="p-2 rounded-lg hover:bg-white/10 text-gray-300 hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
              title="Snapshot Video Frame into Notes (S)"
            >
              <Camera className="w-4 h-4 text-indigo-400" />
              <span className="hidden xl:inline text-[11px] font-medium">Snap</span>
            </button>

            {/* Quick Bookmark Button */}
            <button
              onClick={() => {
                if (videoRef.current && onDropBookmark) {
                  const t = Math.round(videoRef.current.currentTime);
                  onDropBookmark(t);
                  showNotification(`Bookmark dropped at ${formatTime(t)}`);
                }
              }}
              className="p-2 rounded-lg hover:bg-white/10 text-gray-300 hover:text-white transition-colors cursor-pointer"
              title="Drop Bookmark (B)"
            >
              <Bookmark className="w-4 h-4" />
            </button>

            {/* Quick Note Button */}
            <button
              onClick={() => {
                if (videoRef.current && onTakeNote) {
                  const t = Math.round(videoRef.current.currentTime);
                  onTakeNote(t);
                  showNotification(`Note opened at ${formatTime(t)}`);
                }
              }}
              className="p-2 rounded-lg hover:bg-white/10 text-gray-300 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Take Note (N)"
            >
              <Edit3 className="w-4 h-4" />
              <span className="hidden sm:inline text-[11px] font-medium">Note</span>
            </button>

            {/* Subtitles Toggle */}
            {activeSubtitleUrl && (
              <button
                onClick={() => setSubtitlesEnabled(!subtitlesEnabled)}
                className={`p-2 rounded-lg transition-colors cursor-pointer ${
                  subtitlesEnabled
                    ? 'text-indigo-400 bg-white/10'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
                title="Toggle Subtitles"
              >
                <Subtitles className="w-4 h-4" />
              </button>
            )}

            {/* Playback Speed Selector */}
            <div className="relative">
              <button
                onClick={() => setIsSpeedMenuOpen(!isSpeedMenuOpen)}
                className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[11px] font-mono font-semibold transition-colors cursor-pointer"
                title="Playback Speed ([ and ])"
              >
                {playbackSpeed}x
              </button>

              {isSpeedMenuOpen && (
                <div className="absolute bottom-full right-0 mb-2 p-1 bg-[#121626] border border-white/10 rounded-xl shadow-2xl flex flex-col gap-0.5 z-30 min-w-[70px]">
                  {SPEED_OPTIONS.map((speed) => (
                    <button
                      key={speed}
                      onClick={() => {
                        setPlaybackSpeed(speed);
                        setIsSpeedMenuOpen(false);
                      }}
                      className={`px-2.5 py-1 text-[11px] font-mono rounded-lg text-left transition-colors cursor-pointer ${
                        playbackSpeed === speed
                          ? 'bg-indigo-600 text-white font-bold'
                          : 'text-gray-300 hover:bg-white/10'
                      }`}
                    >
                      {speed}x
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={togglePiP}
              className="p-2 rounded-lg hover:bg-white/10 text-gray-300 hover:text-white transition-colors cursor-pointer"
              title="Picture-in-Picture"
            >
              <PictureInPicture className="w-4 h-4" />
            </button>

            <button
              onClick={toggleTheaterMode}
              className={`p-2 rounded-lg hover:bg-white/10 transition-colors cursor-pointer ${
                isTheaterMode ? 'text-indigo-400' : 'text-gray-300 hover:text-white'
              }`}
              title="Theater Mode"
            >
              <Tv className="w-4 h-4" />
            </button>

            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-lg hover:bg-white/10 text-gray-300 hover:text-white transition-colors cursor-pointer"
              title="Fullscreen (F)"
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
