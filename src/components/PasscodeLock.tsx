'use client';

import React, { useState, useRef, useSyncExternalStore } from 'react';
import {
  isPasscodeConfigured,
  isDeviceAuthenticated,
  verifyPasscode,
  setInitialPasscode,
  authenticateDevice,
} from '@/lib/security';
import { Lock, ShieldCheck, ArrowRight, AlertCircle } from 'lucide-react';

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
  const isConfigured = useSyncExternalStore(
    subscribeAuth,
    () => isPasscodeConfigured(),
    () => true
  );

  const isAuthenticated = useSyncExternalStore(
    subscribeAuth,
    () => isDeviceAuthenticated(),
    () => true
  );

  // Form states
  const [passcode, setPasscode] = useState('');
  const [confirmPasscode, setConfirmPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isShaking, setIsShaking] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);

  const triggerShake = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode) return;

    setError(null);
    const valid = await verifyPasscode(passcode);
    if (valid) {
      authenticateDevice();
      window.dispatchEvent(new CustomEvent('courseplex-lock-app'));
      setPasscode('');
    } else {
      setError('Incorrect passcode. Please try again.');
      triggerShake();
      setPasscode('');
      inputRef.current?.focus();
    }
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passcode) return;

    if (passcode.length < 4) {
      setError('Passcode must be at least 4 characters.');
      triggerShake();
      return;
    }

    if (passcode !== confirmPasscode) {
      setError('Passcodes do not match.');
      triggerShake();
      return;
    }

    await setInitialPasscode(passcode);
    window.dispatchEvent(new CustomEvent('courseplex-lock-app'));
  };

  // Already authenticated: render app
  if (isConfigured && isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#090a0f] flex flex-col items-center justify-center p-4 antialiased">
      {/* Background Ambient Glow */}
      <div className="absolute w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />

      <div
        className={`relative w-full max-w-md bg-[#111422] border border-white/10 rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center transition-transform ${
          isShaking ? 'animate-shake' : ''
        }`}
      >
        {/* Brand Icon */}
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
            {!isConfigured
              ? 'Set a master passcode to protect your local course cinema.'
              : 'Enter your passcode to unlock CoursePlex on this device.'}
          </p>
        </div>

        {error && (
          <div className="w-full mb-4 p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Setup Mode vs Unlock Mode */}
        {!isConfigured ? (
          <form onSubmit={handleSetup} className="w-full space-y-3">
            <input
              ref={inputRef}
              type="password"
              placeholder="Enter new passcode (min. 4 chars)"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              className="w-full bg-[#161a2c] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-center tracking-widest font-mono"
              autoFocus
            />
            <input
              type="password"
              placeholder="Confirm passcode"
              value={confirmPasscode}
              onChange={(e) => setConfirmPasscode(e.target.value)}
              className="w-full bg-[#161a2c] border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 text-center tracking-widest font-mono"
            />
            <button
              type="submit"
              disabled={!passcode || !confirmPasscode}
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2"
            >
              <span>Save &amp; Unlock</span>
              <ShieldCheck className="w-4 h-4" />
            </button>
            <p className="text-[11px] text-gray-500 pt-1">
              Tip: You can also define <code className="text-indigo-400">NEXT_PUBLIC_APP_PASSCODE</code> in Vercel environment variables.
            </p>
          </form>
        ) : (
          <form onSubmit={handleUnlock} className="w-full space-y-4">
            <input
              ref={inputRef}
              type="password"
              placeholder="••••••••"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              className="w-full bg-[#161a2c] border border-white/10 rounded-xl px-4 py-3.5 text-base text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 text-center tracking-widest font-mono"
              autoFocus
            />
            <button
              type="submit"
              disabled={!passcode}
              className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold text-xs shadow-xl shadow-indigo-600/30 transition-all flex items-center justify-center gap-2"
            >
              <span>Unlock Cinema</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
