'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useCourseStore } from '@/store/useCourseStore';
import {
  Flame,
  Clock,
  Zap,
  Award,
  CheckCircle2,
  Calendar,
  Layers,
  Sparkles,
  Sliders,
  ChevronRight,
} from 'lucide-react';
import Link from 'next/link';

export default function StatsPage() {
  const { libraryState, scannedCourses, scannedClusters, setDailyGoalMinutes } = useCourseStore();
  const [goalEditing, setGoalEditing] = useState(false);
  const [newGoalInput, setNewGoalInput] = useState(libraryState.dailyGoalMinutes?.toString() || '45');

  const {
    heatMapData,
    currentStreak,
    longestStreak,
    totalRealMinutes,
    totalContentMinutes,
    timeSavedHours,
    todayMinutes,
    clusterStats,
    completedCoursesCount,
    inProgressCoursesCount,
    unstartedCoursesCount,
  } = useMemo(() => {
    if (typeof window === 'undefined') {
      return {
        heatMapData: [],
        currentStreak: 0,
        longestStreak: 0,
        totalRealMinutes: 0,
        totalContentMinutes: 0,
        timeSavedHours: 0,
        todayMinutes: 0,
        clusterStats: [],
        completedCoursesCount: 0,
        inProgressCoursesCount: 0,
        unstartedCoursesCount: 0,
      };
    }
    const sessions = libraryState.studySessions;
    const sessionDateMap = new Map<string, number>();

    let totalReal = 0;
    let totalContent = 0;

    for (const s of sessions) {
      totalReal += s.realMinutesSpent;
      totalContent += s.contentMinutesCovered;
      const existing = sessionDateMap.get(s.date) || 0;
      sessionDateMap.set(s.date, existing + s.realMinutesSpent);
    }

    // Generate 365 days of data backwards from today
    const days: { date: string; minutes: number; dayOfWeek: number }[] = [];
    const today = new Date();
    for (let i = 364; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      days.push({
        date: dateStr,
        minutes: sessionDateMap.get(dateStr) || 0,
        dayOfWeek: d.getDay(),
      });
    }

    // Calculate streaks
    let currStreak = 0;
    let maxStreak = 0;
    let tempStreak = 0;

    const sortedDates = Array.from(sessionDateMap.keys()).sort();
    const todayStr = today.toISOString().slice(0, 10);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10);

    // Check if studied today or yesterday to continue active streak
    const checkingDate = new Date(sessionDateMap.has(todayStr) ? today : yesterday);

    while (true) {
      const dStr = checkingDate.toISOString().slice(0, 10);
      if (sessionDateMap.has(dStr) && (sessionDateMap.get(dStr) || 0) > 0) {
        currStreak++;
        checkingDate.setDate(checkingDate.getDate() - 1);
      } else {
        break;
      }
    }

    // Longest streak
    for (let i = 0; i < days.length; i++) {
      if (days[i].minutes > 0) {
        tempStreak++;
        if (tempStreak > maxStreak) maxStreak = tempStreak;
      } else {
        tempStreak = 0;
      }
    }

    // Today's minutes
    const tMinutes = sessionDateMap.get(todayStr) || 0;

    // Course status counts
    let completedCount = 0;
    let inProgressCount = 0;
    let unstartedCount = 0;

    for (const course of scannedCourses) {
      const meta = libraryState.courses[course.relativePath];
      if (meta?.status === 'completed') completedCount++;
      else if (meta?.status === 'in_progress') inProgressCount++;
      else unstartedCount++;
    }

    // Cluster time breakdown
    const clusterMinutesMap = new Map<string, number>();
    for (const s of sessions) {
      const course = scannedCourses.find((c) => c.relativePath === s.coursePath);
      const clusterId = course?.clusterId || 'other';
      clusterMinutesMap.set(clusterId, (clusterMinutesMap.get(clusterId) || 0) + s.realMinutesSpent);
    }

    const clusterStatsList = scannedClusters.map((cluster) => {
      const mins = clusterMinutesMap.get(cluster.id) || 0;
      const pct = totalReal > 0 ? Math.round((mins / totalReal) * 100) : 0;
      return {
        id: cluster.id,
        name: cluster.name,
        color: cluster.color,
        minutes: mins,
        percentage: pct,
      };
    });

    const timeSavedHrs = Math.max(0, Math.round(((totalContent - totalReal) / 60) * 10) / 10);

    return {
      heatMapData: days,
      currentStreak: currStreak,
      longestStreak: maxStreak,
      totalRealMinutes: Math.round(totalReal),
      totalContentMinutes: Math.round(totalContent),
      timeSavedHours: timeSavedHrs,
      todayMinutes: Math.round(tMinutes),
      clusterStats: clusterStatsList,
      completedCoursesCount: completedCount,
      inProgressCoursesCount: inProgressCount,
      unstartedCoursesCount: unstartedCount,
    };
  }, [libraryState.studySessions, libraryState.courses, scannedCourses, scannedClusters]);

  const dailyGoal = libraryState.dailyGoalMinutes || 45;
  const goalProgress = Math.min(100, Math.round((todayMinutes / dailyGoal) * 100));

  // Determine intensity color for GitHub style heatmap
  const getCellColor = (minutes: number) => {
    if (minutes === 0) return 'bg-[#151929] border border-white/5';
    if (minutes < 20) return 'bg-indigo-950 border border-indigo-800/40';
    if (minutes < 40) return 'bg-indigo-700/60 border border-indigo-600/40';
    if (minutes < 60) return 'bg-indigo-500 border border-indigo-400/50';
    return 'bg-indigo-400 border border-indigo-300 shadow-xs shadow-indigo-500/50';
  };

  const handleSaveGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseInt(newGoalInput, 10);
    if (!isNaN(parsed) && parsed > 0 && parsed <= 300) {
      setDailyGoalMinutes(parsed);
      setGoalEditing(false);
    }
  };

  return (
    <div className="p-6 md:p-10 space-y-8 max-w-7xl mx-auto">
      {/* Top Header */}
      <div>
        <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
          <Award className="w-8 h-8 text-indigo-400" />
          Study Velocity &amp; Analytics
        </h1>
        <p className="text-xs text-gray-400 mt-1">
          Track learning streaks, daily focus targets, and speed-efficiency stats without external databases.
        </p>
      </div>

      {/* Top 4 Metric KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Streak Card */}
        <div className="p-5 rounded-2xl bg-[#111422] border border-white/5 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Current Streak
            </span>
            <div className="text-3xl font-black text-white mt-1 flex items-baseline gap-1.5">
              <span>{currentStreak}</span>
              <span className="text-sm font-semibold text-amber-400">days</span>
            </div>
            <div className="text-[11px] text-gray-500 mt-1">
              Longest: {longestStreak} days
            </div>
          </div>
          <div className="p-3.5 rounded-2xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <Flame className="w-7 h-7 fill-amber-400/20" />
          </div>
        </div>

        {/* Daily Goal Card */}
        <div className="p-5 rounded-2xl bg-[#111422] border border-white/5 flex items-center justify-between">
          <div className="min-w-0 flex-1 mr-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Daily Goal
              </span>
              <button
                onClick={() => setGoalEditing(!goalEditing)}
                className="text-[10px] text-indigo-400 hover:text-indigo-300 underline font-medium"
              >
                {goalEditing ? 'Cancel' : 'Edit'}
              </button>
            </div>

            {goalEditing ? (
              <form onSubmit={handleSaveGoal} className="flex items-center gap-2 mt-2">
                <input
                  type="number"
                  value={newGoalInput}
                  onChange={(e) => setNewGoalInput(e.target.value)}
                  className="w-16 bg-[#161a2c] border border-white/10 rounded-lg px-2 py-1 text-xs text-white"
                  min="5"
                  max="300"
                />
                <button
                  type="submit"
                  className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-xs font-semibold"
                >
                  Save
                </button>
              </form>
            ) : (
              <>
                <div className="text-3xl font-black text-white mt-1 flex items-baseline gap-1.5">
                  <span>{todayMinutes}</span>
                  <span className="text-sm font-semibold text-indigo-400">/ {dailyGoal}m</span>
                </div>
                <div className="w-full h-1.5 bg-black/40 rounded-full overflow-hidden mt-2">
                  <div
                    className="h-full bg-gradient-to-r from-amber-400 to-indigo-500 rounded-full transition-all duration-500"
                    style={{ width: `${goalProgress}%` }}
                  />
                </div>
              </>
            )}
          </div>
          <div className="p-3.5 rounded-2xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 shrink-0">
            <Clock className="w-7 h-7" />
          </div>
        </div>

        {/* Time Saved Through Playback Speed */}
        <div className="p-5 rounded-2xl bg-[#111422] border border-white/5 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Time Saved (Speed)
            </span>
            <div className="text-3xl font-black text-emerald-400 mt-1 flex items-baseline gap-1.5">
              <span>{timeSavedHours}</span>
              <span className="text-sm font-semibold text-emerald-400/80">hrs</span>
            </div>
            <div className="text-[11px] text-gray-500 mt-1">
              At 1.25x – 2x playback speed
            </div>
          </div>
          <div className="p-3.5 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Zap className="w-7 h-7" />
          </div>
        </div>

        {/* Course Completion Ratio */}
        <div className="p-5 rounded-2xl bg-[#111422] border border-white/5 flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Courses Completed
            </span>
            <div className="text-3xl font-black text-white mt-1 flex items-baseline gap-1.5">
              <span>{completedCoursesCount}</span>
              <span className="text-sm font-semibold text-gray-400">
                / {scannedCourses.length}
              </span>
            </div>
            <div className="text-[11px] text-gray-500 mt-1">
              {inProgressCoursesCount} currently in progress
            </div>
          </div>
          <div className="p-3.5 rounded-2xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
            <CheckCircle2 className="w-7 h-7" />
          </div>
        </div>
      </div>

      {/* 365-Day Study Activity Heatmap */}
      <section className="p-6 md:p-8 rounded-3xl bg-[#111422] border border-white/5 space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Calendar className="w-5 h-5 text-indigo-400" />
              <span>365-Day Study Activity Grid</span>
            </h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Every block represents your daily focus duration directly logged from your local sessions.
            </p>
          </div>

          <div className="flex items-center gap-2 text-[10px] text-gray-400">
            <span>Less</span>
            <span className="w-3 h-3 rounded-xs bg-[#151929] border border-white/5" />
            <span className="w-3 h-3 rounded-xs bg-indigo-950 border border-indigo-800/40" />
            <span className="w-3 h-3 rounded-xs bg-indigo-700/60 border border-indigo-600/40" />
            <span className="w-3 h-3 rounded-xs bg-indigo-500 border border-indigo-400/50" />
            <span className="w-3 h-3 rounded-xs bg-indigo-400 border border-indigo-300" />
            <span>More</span>
          </div>
        </div>

        {/* Heatmap Grid Container */}
        <div className="overflow-x-auto pb-2">
          <div className="grid grid-flow-col grid-rows-7 gap-1.5 w-max">
            {heatMapData.map((day) => (
              <div
                key={day.date}
                title={`${day.date}: ${day.minutes} minutes studied`}
                className={`w-3.5 h-3.5 rounded-xs transition-colors cursor-pointer hover:scale-125 ${getCellColor(
                  day.minutes
                )}`}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Track & Cluster Breakdown */}
      {clusterStats.length > 0 && (
        <section className="p-6 md:p-8 rounded-3xl bg-[#111422] border border-white/5 space-y-4">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-400" />
            <span>Track &amp; Cluster Time Distribution</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {clusterStats.map((cluster) => (
              <div
                key={cluster.id}
                className="p-4 rounded-2xl bg-[#141829] border border-white/5 space-y-2.5"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-white flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: cluster.color }}
                    />
                    {cluster.name}
                  </span>
                  <span className="font-mono text-gray-400">
                    {Math.round(cluster.minutes / 60)} hrs ({cluster.percentage}%)
                  </span>
                </div>
                <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${cluster.percentage}%`,
                      backgroundColor: cluster.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
