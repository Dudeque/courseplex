'use client';

import React, { useState, useSyncExternalStore } from 'react';
import { useCourseStore } from '@/store/useCourseStore';
import {
  HardDrive,
  X,
  Folder,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  Sparkles,
} from 'lucide-react';

const subscribeNoop = () => () => {};

export function ServerFolderModal() {
  const {
    isFolderModalOpen,
    setFolderModalOpen,
    isServerMode,
    serverCoursesDir,
    connectServerDirectory,
    disconnectServerDirectory,
  } = useCourseStore();

  const [pathInput, setPathInput] = useState(serverCoursesDir || '');
  const [prevDir, setPrevDir] = useState(serverCoursesDir);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (serverCoursesDir !== prevDir) {
    setPrevDir(serverCoursesDir);
    setPathInput(serverCoursesDir || '');
  }

  const isElectron = useSyncExternalStore(
    subscribeNoop,
    () => Boolean(typeof window !== 'undefined' && window.electronAPI?.isElectron),
    () => false
  );

  const handleBrowseElectron = async () => {
    const api = window.electronAPI;
    if (api?.selectDirectory) {
      try {
        const selected = await api.selectDirectory();
        if (selected) {
          setPathInput(selected);
          setLoading(true);
          setError(null);
          setSuccess(null);
          await connectServerDirectory(selected);
          setSuccess(`Connected: ${selected}`);
          setTimeout(() => {
            setFolderModalOpen(false);
          }, 1200);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to connect folder';
        setError(msg);
      } finally {
        setLoading(false);
      }
    }
  };

  if (!isFolderModalOpen) return null;

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPath = pathInput.replace(/^["']|["']$/g, '').trim();
    if (!cleanPath) {
      setError('Please enter a folder path');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      await connectServerDirectory(cleanPath);
      setSuccess('Connected successfully! Scanning your courses...');
      setTimeout(() => {
        setFolderModalOpen(false);
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to connect folder';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (confirm('Disconnect this local server folder?')) {
      setLoading(true);
      try {
        await disconnectServerDirectory();
        setPathInput('');
        setFolderModalOpen(false);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Failed to disconnect';
        setError(msg);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="relative w-full max-w-lg bg-[#111422] border border-white/10 rounded-3xl p-6 shadow-2xl flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Local Server Directory</h2>
              <p className="text-xs text-gray-400">Stream directly from your hard drive with zero prompts</p>
            </div>
          </div>
          <button
            onClick={() => setFolderModalOpen(false)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Benefits badge */}
        <div className="p-3.5 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300 flex items-start gap-2.5">
          <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-white">Why Local Server Streaming?</p>
            <p className="text-indigo-200/80 leading-relaxed text-[11px]">
              No browser security popups on refresh. Fast HTTP Range video seeking. Available across your local Wi-Fi from your PC, tablet, or phone.
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleConnect} className="space-y-4">
          {isElectron && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={handleBrowseElectron}
                disabled={loading}
                className="w-full py-3 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-xl shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Folder className="w-4 h-4" />
                <span>Browse Windows Folders (Native Dialog)</span>
              </button>
              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-white/10" />
                <span className="flex-shrink mx-3 text-gray-500 text-[10px] uppercase tracking-wider">or enter path manually</span>
                <div className="flex-grow border-t border-white/10" />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-gray-300 flex items-center justify-between">
              <span>Full Folder Path on Your Mac/PC:</span>
              {isServerMode && (
                <span className="text-[10px] text-emerald-400 font-mono flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Currently Connected
                </span>
              )}
            </label>
            <div className="relative">
              <Folder className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={pathInput}
                onChange={(e) => setPathInput(e.target.value)}
                placeholder="/Users/username/Movies/Courses"
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[#0a0c14] border border-white/10 text-white text-xs font-mono placeholder:text-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
                autoFocus
              />
            </div>
            <p className="text-[11px] text-gray-500 leading-normal">
              Mac tip: In Finder, right-click your courses folder, hold <strong className="text-gray-300">Option (⌥)</strong>, and click <strong className="text-gray-300">Copy &ldquo;Folder&rdquo; as Pathname</strong>.
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{success}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            {isServerMode && serverCoursesDir ? (
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={loading}
                className="px-3.5 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-medium border border-red-500/20 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Disconnect</span>
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFolderModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 text-xs font-medium transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !pathInput.trim()}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-lg shadow-indigo-600/30 flex items-center gap-2 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Connecting...</span>
                  </>
                ) : (
                  <span>Connect & Scan</span>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
