'use client';

import React, { useState, useRef, useSyncExternalStore } from 'react';
import {
  isDeviceAuthenticated,
  verifyPasscode,
  authenticateDevice,
} from '@/lib/security';
import { Lock, ArrowRight, AlertCircle, KeyRound } from 'lucide-react';

interface PasscodeLockProps {
  children: React.ReactNode;
}

function subscribeAuth(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('courseplex-lock-app', callback);
  window.addEventListener('storage', callback);
  return () => {
    window.removeEventListener('courseplex-lock-app', callback);
    window.removeEventListener('storage', callback);
  };
}

export function PasscodeLock({ children }: PasscodeLockProps) {
  const isAuthenticated = useSyncExternalStore(
    subscribeAuth,
    () => isDeviceAuthenticated(),
    () => true
  );

  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);

  const triggerShake = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    const valid = await verifyPasscode(passcode);
    if (valid) {
      authenticateDevice();
      window.dispatchEvent(new CustomEvent('courseplex-lock-app'));
      setPasscode('');
    } else {
      setError('Access denied. Incorrect passcode.');
      triggerShake();
      setPasscode('');
      inputRef.current?.focus();
    }
    setIsSubmitting(false);
  };

  // Already authenticated on this device
  if (isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#090a0f] flex flex-col items-center justify-center p-4 antialiased">
      {/* Ambient Cinema Lighting */}
      <div className="absolute w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

      <div
        className={`relative w-full max-w-md bg-[#111422] border border-white/10 rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center transition-transform ${
          isShaking ? 'animate-shake' : ''
        }`}
      >
        {/* Lock Icon */}
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center shadow-xl shadow-indigo-600/30 mb-6">
          <Lock className="w-8 h-8 text-white" />
        </div>

        <div className="space-y-1 mb-6">
          <h1 className="text-2xl font-black text-white tracking-tight flex items-center justify-center gap-2">
            <span>CoursePlex</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 font-mono font-semibold">
              Protected
            </span>
          </h1>
          <p className="text-xs text-gray-400">
            Private Course Cinema. Enter the master passcode to unlock.
          </p>
        </div>

        {error && (
          <div className="w-full mb-4 p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleUnlock} className="w-full space-y-4">
          <div className="relative">
            <KeyRound className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              ref={inputRef}
              type="password"
              placeholder="Enter passcode..."
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              className="w-full bg-[#161a2c] border border-white/10 rounded-xl pl-10 pr-4 py-3.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 tracking-wider font-mono"
              autoFocus
            />
          </div>

          <button
            type="submit"
            disabled={!passcode || isSubmitting}
            className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold text-xs shadow-xl shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            <span>{isSubmitting ? 'Verifying...' : 'Unlock Cinema'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
