'use client';

import React, { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCourseStore } from '@/store/useCourseStore';
import { CommandPalette } from '@/components/CommandPalette';
import {
  Film,
  FileText,
  BarChart2,
  HardDrive,
  FolderSync,
  Layers,
  Search,
  Sparkles,
  Flame,
  CheckCircle2,
  Menu,
  X,
  Lock,
  Wifi,
} from 'lucide-react';
import { lockDevice } from '@/lib/security';
import { ServerFolderModal } from '@/components/ServerFolderModal';

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const navItems = [
    { label: 'Library Home', href: '/', icon: Film },
    { label: 'Clusters & Tracks', href: '/clusters', icon: Layers },
    { label: 'Notes Studio', href: '/notes', icon: FileText },
    { label: 'Analytics & Streaks', href: '/stats', icon: BarChart2 },
  ];

  return (
    <nav className="flex flex-col gap-1.5">
      <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wider px-3 mb-1">
        Menu
      </div>
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive =
          item.href === '/'
            ? pathname === '/'
            : pathname.startsWith(item.href);

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              isActive
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30 font-semibold'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-gray-400'}`} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const {
    init,
    isServerMode,
    setFolderModalOpen,
    rescanServerDirectory,
    rootDirName,
    isDemoMode,
    isScanning,
    scanStatus,
    loadDemoMode,
    libraryState,
  } = useCourseStore();

  useEffect(() => {
    init();
  }, [init]);

  const handleOpenServerHub = () => {
    setMobileMenuOpen(false);
    setFolderModalOpen(true);
  };

  const todayStr = typeof window !== 'undefined' ? new Date().toISOString().slice(0, 10) : '';
  const todaySessions = todayStr ? libraryState.studySessions.filter((s) => s.date === todayStr) : [];
  const todayMinutes = Math.round(todaySessions.reduce((acc, s) => acc + s.realMinutesSpent, 0));

  const dailyGoal = libraryState.dailyGoalMinutes || 45;
  const goalProgress = Math.min(100, Math.round((todayMinutes / dailyGoal) * 100));

  return (
    <div className="min-h-screen bg-[#090a0f] text-[#f3f4f6] flex flex-col md:flex-row antialiased selection:bg-indigo-500 selection:text-white">
      {/* Command Palette */}
      <CommandPalette />

      {/* Mobile Top Header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-[#111420] border-b border-white/10 z-30">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-violet-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Film className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold tracking-tight text-white text-lg">CoursePlex</span>
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenServerHub}
            className="px-2.5 py-1.5 rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-semibold flex items-center gap-1.5"
            aria-label="Server & Network"
          >
            <Wifi className="w-3.5 h-3.5" />
            <span>Server</span>
          </button>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open-command-palette'))}
            className="p-2 rounded-lg bg-white/5 text-gray-300"
            aria-label="Search"
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-lg bg-white/5 text-gray-300"
            aria-label="Menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-30 md:hidden"
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-[#0d101b] border-r border-white/5 flex flex-col justify-between transition-transform duration-200 ease-in-out md:translate-x-0 md:static ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-5 flex flex-col gap-6">
          {/* Logo Brand */}
          <Link href="/" className="flex items-center gap-3 group" onClick={() => setMobileMenuOpen(false)}>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center shadow-lg shadow-indigo-600/30 group-hover:scale-105 transition-transform">
              <Film className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-black text-lg tracking-wider text-white flex items-center gap-1.5">
                COURSE<span className="text-indigo-400">PLEX</span>
              </div>
              <div className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">
                LAN Course Cinema
              </div>
            </div>
          </Link>

          {/* Quick Search Button */}
          <button
            onClick={() => {
              setMobileMenuOpen(false);
              window.dispatchEvent(new CustomEvent('open-command-palette'));
            }}
            className="w-full flex items-center justify-between px-3.5 py-2 rounded-xl bg-[#141829] hover:bg-[#1a2035] border border-white/5 hover:border-indigo-500/30 transition-all text-xs text-gray-400 group"
          >
            <span className="flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-gray-400 group-hover:text-indigo-400" />
              <span>Quick Search...</span>
            </span>
            <kbd className="px-1.5 py-0.5 rounded bg-black/40 border border-white/10 text-[10px] font-mono text-gray-400">
              ⌘K
            </kbd>
          </button>

          {/* Navigation Links */}
          <Suspense fallback={<div className="h-44" />}>
            <NavLinks onNavigate={() => setMobileMenuOpen(false)} />
          </Suspense>

          {/* Daily Goal Mini Card */}
          <div className="p-3.5 rounded-xl bg-gradient-to-br from-[#131726] to-[#181d32] border border-white/5">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-semibold text-gray-200 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-amber-400" />
                Daily Focus
              </span>
              <span className="text-gray-400 font-mono">
                {todayMinutes}m / {dailyGoal}m
              </span>
            </div>
            <div className="w-full h-1.5 bg-black/50 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 to-purple-400 rounded-full transition-all duration-500"
                style={{ width: `${goalProgress}%` }}
              />
            </div>
            {goalProgress >= 100 && (
              <div className="mt-2 text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
                <CheckCircle2 className="w-3 h-3" /> Goal reached today!
              </div>
            )}
          </div>
        </div>

        {/* Bottom Storage Status & Controls */}
        <div className="p-4 border-t border-white/5 bg-[#0a0c14] flex flex-col gap-2.5">
          {isScanning && (
            <div className="text-xs text-indigo-400 flex items-center gap-2 animate-pulse px-2 py-1">
              <FolderSync className="w-3.5 h-3.5 animate-spin" />
              <span className="truncate">{scanStatus || 'Scanning...'}</span>
            </div>
          )}

          {isDemoMode ? (
            <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-purple-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                  Demo Mode Active
                </span>
                <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
              </div>
              <button
                onClick={handleOpenServerHub}
                className="w-full mt-1 py-1.5 px-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-all shadow-md shadow-indigo-600/20 cursor-pointer"
              >
                Connect Server Library
              </button>
            </div>
          ) : isServerMode ? (
            <div className="p-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                  <span className="text-xs text-white font-medium truncate" title={rootDirName || 'Server Library'}>
                    {rootDirName || 'Server Library'}
                  </span>
                </div>
                <button
                  onClick={handleOpenServerHub}
                  className="text-[10px] text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
                  title="Configure server folder"
                >
                  Change
                </button>
              </div>

              <button
                onClick={() => rescanServerDirectory()}
                disabled={isScanning}
                className="w-full py-1 px-2 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <FolderSync className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                <span>Rescan Server Disk</span>
              </button>
              <button
                onClick={handleOpenServerHub}
                className="w-full py-1 px-2 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 text-xs font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Wifi className="w-3.5 h-3.5" />
                <span>Server &amp; Network</span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <button
                onClick={handleOpenServerHub}
                className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <HardDrive className="w-3.5 h-3.5" />
                <span>Server &amp; Network</span>
              </button>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  loadDemoMode();
                }}
                className="w-full py-1 px-3 rounded-xl text-gray-500 hover:text-gray-300 text-[11px] font-medium transition-all text-center cursor-pointer"
              >
                Try Demo Library
              </button>
            </div>
          )}

          {/* Quick Lock Button */}
          <button
            onClick={() => {
              lockDevice();
              window.dispatchEvent(new CustomEvent('courseplex-lock-app'));
            }}
            className="w-full py-1.5 px-2 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-white/5 text-[11px] font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer"
            title="Lock CoursePlex session"
          >
            <Lock className="w-3 h-3" />
            <span>Lock App</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>

      {/* Server Folder & Network Hub Modal */}
      <ServerFolderModal />
    </div>
  );
}
