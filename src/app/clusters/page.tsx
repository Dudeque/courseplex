'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useCourseStore } from '@/store/useCourseStore';
import { CourseCard } from '@/components/CourseCard';
import {
  Layers,
  Plus,
  PlayCircle,
  Clock,
  CheckCircle2,
  BookOpen,
  ArrowRight,
  FolderOpen,
} from 'lucide-react';

export default function ClustersPage() {
  const { scannedClusters, scannedCourses, libraryState, createCluster } = useCourseStore();

  const [isCreating, setIsCreating] = useState(false);
  const [newClusterName, setNewClusterName] = useState('');
  const [newClusterColor, setNewClusterColor] = useState('#6366f1');
  const [newClusterDesc, setNewClusterDesc] = useState('');

  const handleCreateCluster = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClusterName.trim()) return;

    createCluster(newClusterName.trim(), newClusterColor, newClusterDesc.trim());
    setNewClusterName('');
    setNewClusterDesc('');
    setIsCreating(false);
  };

  // Merge auto-scanned clusters with user custom clusters from libraryState
  const allClusters = [...scannedClusters];
  for (const [id, cluster] of Object.entries(libraryState.clusters)) {
    if (!allClusters.some((c) => c.id === id)) {
      allClusters.push({
        id: cluster.id,
        name: cluster.name,
        relativePath: cluster.name,
        color: cluster.color,
        coursePaths: cluster.coursePaths || [],
      });
    }
  }

  return (
    <div className="p-6 md:p-10 space-y-8 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <Layers className="w-8 h-8 text-indigo-400" />
            Clusters &amp; Learning Paths
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Group your local courses into structured curricula, tracks, and learning paths.
          </p>
        </div>

        <button
          onClick={() => setIsCreating(!isCreating)}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/30 transition-all flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>New Track</span>
        </button>
      </div>

      {/* New Cluster Form Modal / Card */}
      {isCreating && (
        <form
          onSubmit={handleCreateCluster}
          className="p-5 rounded-2xl bg-[#111422] border border-indigo-500/30 space-y-3 animate-in fade-in"
        >
          <h3 className="text-sm font-bold text-white">Create Custom Learning Track</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Track Name (e.g. AI Engineering 2026)"
              value={newClusterName}
              onChange={(e) => setNewClusterName(e.target.value)}
              className="bg-[#161a2c] border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/50"
              autoFocus
            />
            <input
              type="text"
              placeholder="Description (Optional)"
              value={newClusterDesc}
              onChange={(e) => setNewClusterDesc(e.target.value)}
              className="bg-[#161a2c] border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500/50"
            />
          </div>
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Accent Color:</span>
              <input
                type="color"
                value={newClusterColor}
                onChange={(e) => setNewClusterColor(e.target.value)}
                className="w-7 h-7 rounded-lg cursor-pointer bg-transparent border-0"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!newClusterName.trim()}
                className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold"
              >
                Create Track
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Tracks List */}
      {allClusters.length === 0 ? (
        <div className="p-16 text-center rounded-2xl bg-[#111422] border border-white/5 space-y-3">
          <Layers className="w-10 h-10 text-gray-600 mx-auto" />
          <h3 className="text-base font-bold text-white">No Clusters Found</h3>
          <p className="text-xs text-gray-400 max-w-sm mx-auto">
            Organize your course folders into category subdirectories (e.g., &quot;Frontend&quot; or &quot;DevOps&quot;)
            or create custom tracks above.
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          {allClusters.map((cluster) => {
            // Find courses belonging to this cluster
            const clusterCourses = scannedCourses.filter(
              (c) =>
                c.clusterId === cluster.id ||
                c.clusterName === cluster.name ||
                libraryState.courses[c.relativePath]?.clusterIds?.includes(cluster.id)
            );

            // Compute total lessons & duration in cluster
            let totalLessons = 0;
            let totalDuration = 0;
            let completedLessons = 0;

            for (const course of clusterCourses) {
              totalLessons += course.totalLessons;
              totalDuration += course.totalDurationSeconds;
              for (const mod of course.modules) {
                for (const les of mod.lessons) {
                  if (libraryState.progress[les.relativePath]?.completed) {
                    completedLessons++;
                  }
                }
              }
            }

            const totalHours = Math.round(totalDuration / 3600);
            const clusterProgressPct =
              totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

            return (
              <section
                key={cluster.id}
                className="p-6 md:p-8 rounded-3xl bg-[#111422] border border-white/5 space-y-6"
              >
                {/* Cluster Header */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs"
                        style={{ backgroundColor: cluster.color }}
                      />
                      <h2 className="text-xl font-bold text-white tracking-tight">
                        {cluster.name}
                      </h2>
                      <span className="text-xs text-gray-400 font-mono bg-white/5 px-2 py-0.5 rounded-md">
                        {clusterCourses.length} {clusterCourses.length === 1 ? 'course' : 'courses'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      <span>{totalLessons} Lessons</span>
                      <span>•</span>
                      <span>{totalHours > 0 ? `${totalHours} Hours` : 'Multi-Hour'}</span>
                      <span>•</span>
                      <span>{clusterProgressPct}% Completed</span>
                    </div>
                  </div>

                  {/* Mini Progress Bar */}
                  <div className="w-full sm:w-48 space-y-1.5">
                    <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${clusterProgressPct}%`,
                          backgroundColor: cluster.color,
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Courses in Track */}
                {clusterCourses.length === 0 ? (
                  <div className="py-8 text-center text-gray-500 text-xs">
                    No courses assigned to this track yet.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {clusterCourses.map((course) => (
                      <CourseCard key={course.relativePath} course={course} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
