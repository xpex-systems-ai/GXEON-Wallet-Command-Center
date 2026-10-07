import React, { useState } from 'react';
import { Shield, Lock, Mail, KeyRound, AlertCircle, ArrowRight } from 'lucide-react';
import { loginWithEmail } from '../../firebase/auth';
import { syncUserProfile } from '../../services/firestore/userRepository';

interface AuthGateProps {
  onAuthenticated: () => void;
  onBypassLocal?: () => void;
}

export const AuthGate: React.FC<AuthGateProps> = ({ onAuthenticated, onBypassLocal }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // CRITICAL SECURITY REQUIREMENT:
  // In production hosting (import.meta.env.DEV !== true), Auth Gate MUST be strictly enforced.
  // Local Mode bypass is strictly prohibited in production.
  const isDevMode = Boolean(import.meta.env.DEV);
  const showDevBypass = isDevMode && Boolean(onBypassLocal);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError('Email and password are required.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);

    try {
      const user = await loginWithEmail(email, password);
      await syncUserProfile(user.uid, user.email || email);
      onAuthenticated();
    } catch (err: unknown) {
      const fbErr = err as { code?: string; message?: string };
      if (fbErr.code === 'auth/configuration-not-found') {
        setError('Firebase Auth is not enabled in project. Enable Email/Password provider in Firebase Console under Authentication > Sign-in method.');
      } else if (fbErr.code === 'auth/invalid-credential' || fbErr.code === 'auth/wrong-password' || fbErr.code === 'auth/user-not-found') {
        setError('Invalid email or password.');
      } else if (fbErr.code === 'auth/email-already-in-use') {
        setError('This email is already registered. Please login.');
      } else {
        setError(fbErr.message || 'Authentication failed. Please check credentials.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0B1220] p-4 text-slate-100">
      <div className="w-full max-w-md bg-[#0F172A] border border-[#1E314F] rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        {/* Glow accent */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#FF7A00]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-[#00D4FF]/10 rounded-full blur-3xl pointer-events-none" />

        {/* Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-[#111C30] border border-[#1E314F] flex items-center justify-center mb-4 shadow-glow-orange">
            <Shield className="w-8 h-8 text-[#FF7A00]" />
          </div>
          <h1 className="text-2xl font-bold font-mono text-white tracking-wider">
            GXEON <span className="text-[#FF7A00]">COMMAND CENTER</span>
          </h1>
          <p className="text-xs text-slate-400 font-mono mt-1">
            Cloud Control Plane // Identity & Access Gate
          </p>
        </div>

        {/* Security Warning */}
        <div className="mb-6 p-3 rounded-lg bg-[#111C30] border border-emerald-500/30 text-xs font-mono text-emerald-400 flex items-start gap-2.5">
          <Lock className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
          <div>
            <strong>ZERO PRIVATE KEYS STORED:</strong> This login authenticates your Control Plane dashboard. Private keys remain strictly on your local signing bridge.
          </div>
        </div>

        {error && (
          <div className="mb-6 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-mono text-slate-300 mb-1.5">OPERATOR EMAIL</label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operator@gxeon.org"
                className="w-full bg-[#111C30] border border-[#1E314F] rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#FF7A00] font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-slate-300 mb-1.5">PASSWORD</label>
            <div className="relative">
              <KeyRound className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-[#111C30] border border-[#1E314F] rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#FF7A00] font-mono"
              />
            </div>
          </div>


          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 px-4 rounded-lg bg-gradient-to-r from-[#FF7A00] to-[#E06A00] hover:from-[#FF8B1F] hover:to-[#FF7A00] text-black font-mono font-bold text-sm tracking-wider uppercase transition-all shadow-glow-orange flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <span>AUTHENTICATING...</span> : <><span>ACCESS COMMAND CENTER</span><ArrowRight className="w-4 h-4" /></>}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-[#1E314F] flex flex-col items-center gap-3 text-xs text-slate-400 font-mono">
          <div className="text-slate-500 text-[11px]">OWNER-ONLY // account provisioning is administrative</div>

          {showDevBypass && (
            <button
              type="button"
              data-testid="dev-bypass-btn"
              onClick={onBypassLocal}
              className="text-slate-500 hover:text-slate-300 text-[11px]"
            >
              [DEV ONLY] Skip Cloud Auth &rarr; Offline Local Mode
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
