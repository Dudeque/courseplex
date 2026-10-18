'use client';

import React, { useRef, useMemo } from 'react';
import { useCourseStore } from '@/store/useCourseStore';
import { OnDeckHero } from '@/components/OnDeckHero';
import { CourseCard } from '@/components/CourseCard';
import { triggerMountDirectory } from '@/lib/fs-handle';
import {
  HardDrive,
  FolderSync,
  Layers,
  Sparkles,
  Upload,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  BookOpen,
  Star,
  SlidersHorizontal,
  AlertCircle,
} from 'lucide-react';

export default function HomePage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const {
    rootDirHandle,
    rootDirName,
    permissionGranted,
    isDemoMode,
    isScanning,
    scanStatus,
    scannedCourses,
    scannedClusters,
    libraryState,
    connectDirectory,
    reconnectDirectory,
    rescanDirectory,
    loadDemoMode,
    scanFromInputFiles,
    searchQuery,
    setSearchQuery,
    filterCluster,
    setFilterCluster,
    filterStatus,
    setFilterStatus,
    sortBy,
    setSortBy,
  } = useCourseStore();

  const handleDirectoryUploadFallback = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      scanFromInputFiles(e.target.files);
    }
  };

  // Filter & Sort Courses
  const filteredCourses = useMemo(() => {
    return scannedCourses.filter((course) => {
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = course.title.toLowerCase().includes(q);
        const matchesCluster = course.clusterName?.toLowerCase().includes(q);
        if (!matchesTitle && !matchesCluster) return false;
      }

      // Cluster filter
      if (filterCluster && course.clusterId !== filterCluster) {
        return false;
      }

      // Status filter
      const userMeta = libraryState.courses[course.relativePath];
      const isFavorite = userMeta?.isFavorite ?? false;

      let completedCount = 0;
      for (const mod of course.modules) {
        for (const les of mod.lessons) {
          if (libraryState.progress[les.relativePath]?.completed) {
            completedCount++;
          }
        }
      }
      const isCompleted = course.totalLessons > 0 && completedCount >= course.totalLessons;
      const isInProgress = completedCount > 0 && !isCompleted;
      const isNotStarted = completedCount === 0;

      if (filterStatus === 'favorites' && !isFavorite) return false;
      if (filterStatus === 'completed' && !isCompleted) return false;
      if (filterStatus === 'in_progress' && !isInProgress) return false;
      if (filterStatus === 'not_started' && !isNotStarted) return false;

      return true;
    }).sort((a, b) => {
      if (sortBy === 'title') {
        return a.title.localeCompare(b.title);
      }
      if (sortBy === 'duration') {
        return b.totalDurationSeconds - a.totalDurationSeconds;
      }
      if (sortBy === 'progress') {
        const getPct = (c: typeof a) => {
          let count = 0;
          for (const m of c.modules) {
            for (const l of m.lessons) {
              if (libraryState.progress[l.relativePath]?.completed) count++;
            }
          }
          return c.totalLessons > 0 ? count / c.totalLessons : 0;
        };
        return getPct(b) - getPct(a);
      }
      // 'recent' default
      const metaA = libraryState.courses[a.relativePath]?.lastAccessedAt || '1970';
      const metaB = libraryState.courses[b.relativePath]?.lastAccessedAt || '1970';
      return new Date(metaB).getTime() - new Date(metaA).getTime();
    });
  }, [scannedCourses, searchQuery, filterCluster, filterStatus, sortBy, libraryState]);

  return (
    <div className="p-6 md:p-10 space-y-8 max-w-7xl mx-auto">
      {/* Hidden webkitdirectory file input for non-Chromium fallback */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleDirectoryUploadFallback}
        // @ts-expect-error webkitdirectory is standard browser extension
        webkitdirectory=""
        directory=""
        multiple
        className="hidden"
      />

      {/* Welcome Hero when no courses are loaded */}
      {!isDemoMode && scannedCourses.length === 0 ? (
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#121626] via-[#161a30] to-[#0d101a] border border-indigo-500/20 p-8 md:p-12 shadow-2xl">
          <div className="relative z-10 max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Zero-Cloud • 100% Local Hard Drive</span>
            </div>
            <h1 className="text-3xl md:text-5xl font-black text-white tracking-tight leading-tight">
              Your Personal Netflix &amp; Plex for Video Courses.
            </h1>
            <p className="text-sm md:text-base text-gray-300 leading-relaxed">
              Mount your local hard drive courses directory. Stream high-res videos instantly,
              convert `.srt` subtitles on the fly, take timestamped markdown notes, and track your
              study streaks without cloud uploads or external databases.
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-4">
              <button
                onClick={() => triggerMountDirectory()}
                className="px-6 py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm shadow-xl shadow-indigo-600/30 transition-all flex items-center gap-2 hover:scale-105 cursor-pointer"
              >
                <HardDrive className="w-4 h-4" />
                <span>Mount Local Courses Folder</span>
              </button>

              <button
                onClick={() => loadDemoMode()}
                className="px-6 py-3.5 rounded-2xl bg-white/10 hover:bg-white/15 text-white font-semibold text-sm border border-white/10 transition-all flex items-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span>Explore Demo Library</span>
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-gray-200 text-xs font-medium transition-all flex items-center gap-2 cursor-pointer"
                title="Browser directory fallback for Safari/Firefox"
              >
                <Upload className="w-4 h-4" />
                <span>Select Folder (Fallback)</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Permission Re-authentication / Re-mount Banner (when courses exist in cache but permissions need gesture) */}
      {!permissionGranted && !isDemoMode && scannedCourses.length > 0 ? (
        <div className="p-6 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="font-bold text-amber-200 text-base flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{rootDirHandle ? 'Hard Drive Permission Required' : 'Mount Course Folder to Stream'}</span>
            </h3>
            <p className="text-xs text-amber-300/80">
              {rootDirHandle
                ? `Browser security requires re-confirming permission to read & sync "${rootDirName || rootDirHandle.name}" on your disk.`
                : `Showing cached courses for "${rootDirName || 'your library'}". Click Re-mount Folder to stream videos directly.`}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => (rootDirHandle ? reconnectDirectory() : triggerMountDirectory())}
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs shadow-lg shadow-amber-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <FolderSync className="w-4 h-4" />
              <span>{rootDirHandle ? 'Reconnect Disk Access' : 'Re-mount Folder'}</span>
            </button>
          </div>
        </div>
      ) : null}

      {/* On Deck Hero Carousel */}
      <OnDeckHero />

      {/* Filter and Course Catalog Section */}
      <section className="space-y-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-indigo-400" />
              Course Catalog
            </h2>
            <p className="text-xs text-gray-400 mt-1">
              {filteredCourses.length} {filteredCourses.length === 1 ? 'course' : 'courses'} found
              {filterCluster && ' in active track'}
            </p>
          </div>

          {/* Search & Sort Controls */}
          <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 md:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                className="w-full bg-[#121626] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/50"
                placeholder="Search courses or topics..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="bg-[#121626] border border-white/10 rounded-xl px-3 py-2 text-xs text-gray-300 focus:outline-none cursor-pointer"
            >
              <option value="recent">Recently Watched</option>
              <option value="title">Title (A-Z)</option>
              <option value="progress">% Completed</option>
              <option value="duration">Total Duration</option>
            </select>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-b border-white/5 pb-4">
          {/* Status Pills */}
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              filterStatus === 'all'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            All Courses
          </button>
          <button
            onClick={() => setFilterStatus('in_progress')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              filterStatus === 'in_progress'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            In Progress
          </button>
          <button
            onClick={() => setFilterStatus('completed')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              filterStatus === 'completed'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            Completed
          </button>
          <button
            onClick={() => setFilterStatus('not_started')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              filterStatus === 'not_started'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            Not Started
          </button>
          <button
            onClick={() => setFilterStatus('favorites')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1 ${
              filterStatus === 'favorites'
                ? 'bg-amber-500 text-black shadow-md shadow-amber-500/30'
                : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <Star className="w-3 h-3 fill-current" />
            <span>Favorites</span>
          </button>

          {/* Cluster Filter Pills */}
          {scannedClusters.length > 0 && (
            <>
              <div className="h-4 w-[1px] bg-white/10 mx-1" />
              {scannedClusters.map((cluster) => {
                const isSelected = filterCluster === cluster.id;
                return (
                  <button
                    key={cluster.id}
                    onClick={() => setFilterCluster(isSelected ? null : cluster.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                        : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: cluster.color }}
                    />
                    <span>{cluster.name}</span>
                  </button>
                );
              })}
            </>
          )}
        </div>

        {/* Course Cards Grid */}
        {filteredCourses.length === 0 ? (
          <div className="p-12 text-center rounded-2xl bg-[#111422] border border-white/5 space-y-3">
            <BookOpen className="w-10 h-10 text-gray-600 mx-auto" />
            <h3 className="text-base font-bold text-white">No courses match your criteria</h3>
            <p className="text-xs text-gray-400 max-w-sm mx-auto">
              Try adjusting your search keywords, clearing cluster filters, or rescanning your local folder.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {filteredCourses.map((course) => (
              <CourseCard key={course.relativePath} course={course} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
