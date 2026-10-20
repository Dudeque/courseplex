'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useCourseStore } from '@/store/useCourseStore';
import { apiUrl, getServerBase, setServerBase, normalizeServerUrl } from '@/lib/server-url';
import { QrCode } from '@/components/QrCode';
import {
  HardDrive,
  X,
  Folder,
  FolderUp,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  Wifi,
  Copy,
  Server,
  Sparkles,
  KeyRound,
  Cpu,
} from 'lucide-react';

interface FsListing {
  path: string | null;
  parent: string | null;
  entries: { name: string; path: string }[];
  drives?: { name: string; path: string }[];
  shortcuts?: { name: string; path: string }[];
}

interface ServerInfo {
  name: string;
  lanUrls: string[];
  coursesDir: string | null;
}

type AiProvider = 'gemini' | 'openai' | 'anthropic' | 'groq' | 'ollama';

interface AiConfigState {
  provider: AiProvider;
  model: string;
  hasApiKey: boolean;
  ollamaUrl: string;
  ollamaModels: string[];
  defaultModels: Record<AiProvider, string>;
}

const PROVIDER_LABELS: { id: AiProvider; label: string; badge: string }[] = [
  { id: 'ollama', label: 'Ollama (Local PC)', badge: '100% Free & Offline' },
  { id: 'gemini', label: 'Google Gemini', badge: 'Fast & Long Context' },
  { id: 'openai', label: 'OpenAI', badge: 'GPT-4o / Mini' },
  { id: 'anthropic', label: 'Anthropic Claude', badge: 'Claude 3.5 Sonnet' },
  { id: 'groq', label: 'Groq Cloud', badge: 'Ultra-Fast Llama' },
];

function FolderRow({
  name,
  path,
  icon,
  onBrowse,
}: {
  name: string;
  path: string;
  icon?: React.ReactNode;
  onBrowse: (path: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onBrowse(path)}
      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-white/5 text-left text-xs text-gray-200 cursor-pointer"
    >
      {icon ?? <Folder className="w-4 h-4 text-indigo-400 shrink-0" />}
      <span className="truncate">{name}</span>
    </button>
  );
}

export function ServerFolderModal() {
  const {
    isFolderModalOpen,
    setFolderModalOpen,
    isServerMode,
    serverCoursesDir,
    connectServerDirectory,
    disconnectServerDirectory,
  } = useCourseStore();

  const [tab, setTab] = useState<'library' | 'connect' | 'ai'>('library');
  const [listing, setListing] = useState<FsListing | null>(null);
  const [info, setInfo] = useState<ServerInfo | null>(null);
  const [remoteInput, setRemoteInput] = useState(() => getServerBase());
  const [currentRemote, setCurrentRemote] = useState(() => getServerBase());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // AI settings state
  const [aiConfig, setAiConfig] = useState<AiConfigState | null>(null);
  const [aiProvider, setAiProvider] = useState<AiProvider>('ollama');
  const [aiModel, setAiModel] = useState('llama3.2');
  const [aiApiKey, setAiApiKey] = useState('');
  const [ollamaUrl, setOllamaUrl] = useState('http://127.0.0.1:11434');

  const browse = useCallback(async (dir: string | null) => {
    setError(null);
    try {
      const url = dir ? `/api/local/fs?path=${encodeURIComponent(dir)}` : '/api/local/fs';
      const res = await fetch(apiUrl(url));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Cannot open folder');
      setListing(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Cannot reach server');
    }
  }, []);

  useEffect(() => {
    if (!isFolderModalOpen) return;
    let cancelled = false;
    const url = serverCoursesDir
      ? `/api/local/fs?path=${encodeURIComponent(serverCoursesDir)}`
      : '/api/local/fs';

    fetch(apiUrl(url))
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data && !data.error) {
          setListing(data);
          const base = getServerBase();
          setCurrentRemote(base);
          setRemoteInput(base);
        }
      })
      .catch(() => {});

    fetch(apiUrl('/api/local/info'))
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setInfo(data);
      })
      .catch(() => {
        if (!cancelled) setInfo(null);
      });

    fetch(apiUrl('/api/local/ai'))
      .then((r) => r.json())
      .then((data: AiConfigState) => {
        if (!cancelled && data && data.provider) {
          setAiConfig(data);
          setAiProvider(data.provider);
          setAiModel(data.model || '');
          setOllamaUrl(data.ollamaUrl || 'http://127.0.0.1:11434');
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [isFolderModalOpen, serverCoursesDir]);

  if (!isFolderModalOpen) return null;

  const handleSelectCurrent = async () => {
    if (!listing?.path) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      await connectServerDirectory(listing.path);
      setSuccess('Library connected! Scanning your courses...');
      setTimeout(() => setFolderModalOpen(false), 1000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to connect folder');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect the library folder on this server?')) return;
    setLoading(true);
    try {
      await disconnectServerDirectory();
      setFolderModalOpen(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to disconnect');
    } finally {
      setLoading(false);
    }
  };

  const handleConnectRemote = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (!remoteInput.trim()) {
        setServerBase(null);
      } else {
        const url = normalizeServerUrl(remoteInput);
        const res = await fetch(`${url}/api/local/info`);
        const data = await res.json();
        if (data.app !== 'courseplex') throw new Error('That address is not a CoursePlex server');
        setServerBase(url);
      }
      window.location.reload();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? `Could not reach server: ${err.message}`
          : 'Could not reach server'
      );
      setLoading(false);
    }
  };

  const handleSaveAiConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(apiUrl('/api/local/ai'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_config',
          provider: aiProvider,
          model: aiModel,
          ...(aiApiKey.trim() ? { apiKey: aiApiKey.trim() } : {}),
          ollamaUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save AI configuration');
      setAiApiKey('');
      setAiConfig((prev) => (prev ? { ...prev, provider: data.provider, model: data.model, hasApiKey: data.hasApiKey } : prev));
      setSuccess('AI Engine saved on server! All devices on your network can now use the AI Tutor.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save AI configuration');
    } finally {
      setLoading(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // clipboard unavailable
    }
  };

  const primaryLanUrl = info?.lanUrls?.[0] || null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="relative w-full max-w-xl bg-[#111422] border border-white/10 rounded-3xl p-6 shadow-2xl flex flex-col gap-4 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Server, Network &amp; AI Hub</h2>
              <p className="text-xs text-gray-400">
                {currentRemote ? `Connected to ${currentRemote}` : `Server host: ${info?.name || 'Local Machine'}`}
              </p>
            </div>
          </div>
          <button
            onClick={() => setFolderModalOpen(false)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-1 p-1 rounded-xl bg-black/30 text-xs font-semibold">
          {([
            { id: 'library', label: 'Library & LAN QR' },
            { id: 'connect', label: 'Connect Server' },
            { id: 'ai', label: 'AI Engine (LLM)' },
          ] as const).map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setTab(t.id);
                setError(null);
                setSuccess(null);
              }}
              className={`flex-1 py-2 rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                tab === t.id ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-white'
              }`}
            >
              {t.id === 'ai' && <Sparkles className="w-3.5 h-3.5" />}
              <span>{t.label}</span>
            </button>
          ))}
        </div>

        {tab === 'library' && (
          <div className="space-y-3">
            {info && info.lanUrls.length > 0 && (
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="space-y-1.5 flex-1 min-w-0">
                  <p className="font-semibold flex items-center gap-1.5 text-emerald-300">
                    <Wifi className="w-3.5 h-3.5" /> Share across your Wi-Fi / LAN
                  </p>
                  <p className="text-[11px] text-emerald-200/80">
                    Scan the QR code with your phone or open this URL on any computer on your network:
                  </p>
                  <div className="space-y-1 pt-1">
                    {info.lanUrls.map((u) => (
                      <button
                        key={u}
                        type="button"
                        onClick={() => copy(u)}
                        className="flex items-center gap-2 font-mono text-xs text-white bg-black/30 px-2.5 py-1.5 rounded-lg border border-white/10 hover:border-emerald-400/50 cursor-pointer"
                      >
                        <span className="truncate">{u}</span>
                        {copied === u ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 opacity-60 shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
                {primaryLanUrl && (
                  <div className="shrink-0 flex flex-col items-center gap-1">
                    <QrCode value={primaryLanUrl} size={108} />
                    <span className="text-[10px] text-emerald-300/80 font-medium">Scan on Phone</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between text-[11px] font-mono text-gray-400 min-h-6">
              <div className="flex items-center gap-2 min-w-0">
                <HardDrive className="w-3.5 h-3.5 shrink-0 text-indigo-400" />
                <span className="truncate">{listing?.path ?? 'Choose a drive or shortcut on the server'}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {listing?.path && (
                  <button
                    type="button"
                    onClick={() => browse(null)}
                    className="text-[10px] text-indigo-400 hover:text-indigo-300 hover:underline cursor-pointer"
                  >
                    Change Drive
                  </button>
                )}
              </div>
            </div>

            {/* Quick manual path input */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="Or type/paste path directly (e.g. D:\Courses or /mnt/storage)"
                defaultValue={listing?.path || ''}
                key={listing?.path || 'empty'}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const val = (e.currentTarget.value || '').trim();
                    if (val) browse(val);
                  }
                }}
                className="flex-1 px-3 py-1.5 rounded-lg bg-[#0a0c14] border border-white/10 text-white text-xs font-mono placeholder:text-gray-600 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="h-52 overflow-y-auto rounded-xl bg-[#0a0c14] border border-white/10 p-1.5">
              {listing?.path && (
                <FolderRow
                  name=".."
                  path={listing.parent ?? ''}
                  onBrowse={browse}
                  icon={<FolderUp className="w-4 h-4 text-gray-400 shrink-0" />}
                />
              )}
              {!listing?.path && (
                <>
                  {listing?.shortcuts?.map((d) => (
                    <FolderRow key={d.path} {...d} onBrowse={browse} />
                  ))}
                  {listing?.drives?.map((d) => (
                    <FolderRow
                      key={d.path}
                      {...d}
                      onBrowse={browse}
                      icon={<HardDrive className="w-4 h-4 text-amber-400 shrink-0" />}
                    />
                  ))}
                </>
              )}
              {listing?.entries.map((d) => (
                <FolderRow key={d.path} {...d} onBrowse={browse} />
              ))}
              {listing?.path && listing.entries.length === 0 && (
                <p className="p-3 text-xs text-gray-500">No subfolders here.</p>
              )}
            </div>
          </div>
        )}

        {tab === 'connect' && (
          <form onSubmit={handleConnectRemote} className="space-y-3">
            <p className="text-xs text-gray-400 leading-relaxed">
              Enter the address of a CoursePlex server on your network (for example{' '}
              <span className="font-mono text-gray-200">192.168.1.20</span> or{' '}
              <span className="font-mono text-gray-200">http://my-pc:32433</span>). Leave empty to use
              this device as the server.
            </p>
            <input
              type="text"
              value={remoteInput}
              onChange={(e) => setRemoteInput(e.target.value)}
              placeholder="192.168.1.20:32433"
              className="w-full px-4 py-2.5 rounded-xl bg-[#0a0c14] border border-white/10 text-white text-xs font-mono placeholder:text-gray-600 focus:outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold cursor-pointer flex items-center gap-2"
            >
              {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {remoteInput.trim() ? 'Connect to Server' : 'Use This Device'}
            </button>
          </form>
        )}

        {tab === 'ai' && (
          <form onSubmit={handleSaveAiConfig} className="space-y-4">
            <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-200 flex items-start gap-2.5">
              <Cpu className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-white">Server-Side AI Engine</p>
                <p className="text-[11px] text-indigo-200/80 leading-relaxed">
                  Powers the AI Lesson Tutor, 1-click Cheat-Sheet Summaries, and Auto-Chapters across every device on your network.
                </p>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-300">Provider</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PROVIDER_LABELS.map((p) => {
                  const selected = aiProvider === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setAiProvider(p.id);
                        if (aiConfig?.defaultModels?.[p.id]) {
                          setAiModel(
                            p.id === 'ollama' && aiConfig.ollamaModels?.length > 0
                              ? aiConfig.ollamaModels[0]
                              : aiConfig.defaultModels[p.id]
                          );
                        }
                      }}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        selected
                          ? 'bg-indigo-600/20 border-indigo-500 text-white'
                          : 'bg-[#0a0c14] border-white/10 text-gray-300 hover:border-white/20'
                      }`}
                    >
                      <div className="text-xs font-bold">{p.label}</div>
                      <div className="text-[10px] text-gray-400">{p.badge}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {aiProvider === 'ollama' ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-300">Ollama Host URL (on Server PC)</label>
                  <input
                    type="text"
                    value={ollamaUrl}
                    onChange={(e) => setOllamaUrl(e.target.value)}
                    placeholder="http://127.0.0.1:11434"
                    className="w-full px-3.5 py-2 rounded-xl bg-[#0a0c14] border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-300 flex items-center justify-between">
                    <span>Model Name</span>
                    {aiConfig?.ollamaModels && aiConfig.ollamaModels.length > 0 && (
                      <span className="text-[10px] text-emerald-400 font-mono">
                        {aiConfig.ollamaModels.length} local model(s) detected
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                    placeholder="llama3.2"
                    className="w-full px-3.5 py-2 rounded-xl bg-[#0a0c14] border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                  />
                  {aiConfig?.ollamaModels && aiConfig.ollamaModels.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {aiConfig.ollamaModels.map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setAiModel(m)}
                          className={`px-2 py-0.5 rounded-md text-[11px] font-mono border cursor-pointer ${
                            aiModel === m
                              ? 'bg-indigo-600 text-white border-indigo-500'
                              : 'bg-white/5 text-gray-300 border-white/10 hover:bg-white/10'
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-300 flex items-center justify-between">
                    <span>API Key ({aiProvider.toUpperCase()})</span>
                    {aiConfig?.hasApiKey && aiConfig.provider === aiProvider && (
                      <span className="text-[10px] text-emerald-400 font-mono">Saved on server</span>
                    )}
                  </label>
                  <div className="relative">
                    <KeyRound className="w-3.5 h-3.5 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      value={aiApiKey}
                      onChange={(e) => setAiApiKey(e.target.value)}
                      placeholder={
                        aiConfig?.hasApiKey && aiConfig.provider === aiProvider
                          ? '•••••••••••••••• (leave blank to keep existing key)'
                          : 'Paste your API key...'
                      }
                      className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-[#0a0c14] border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-gray-300">Model</label>
                  <input
                    type="text"
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-[#0a0c14] border border-white/10 text-white text-xs font-mono focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 flex items-center gap-2 cursor-pointer"
              >
                {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Save AI Settings</span>
              </button>
            </div>
          </form>
        )}

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

        {tab === 'library' && (
          <div className="flex items-center justify-between gap-3 pt-1">
            {isServerMode && serverCoursesDir ? (
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={loading}
                className="px-3.5 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-medium border border-red-500/20 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Disconnect
              </button>
            ) : (
              <div />
            )}
            <button
              type="button"
              onClick={handleSelectCurrent}
              disabled={loading || !listing?.path}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold shadow-lg shadow-indigo-600/30 flex items-center gap-2 cursor-pointer"
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
              Use this folder &amp; scan
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
