import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Banknote, User, Lock, Eye, EyeOff, ArrowRight, AlertCircle, Sparkles } from 'lucide-react';
import { useAuth } from '../../context/AuthContext.jsx';
import LoginHero from './components/LoginHero.jsx';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErrorMsg('Silakan masukkan username/email dan password Anda.');
      return;
    }
    setErrorMsg('');
    setIsLoading(true);

    try {
      const apiUrl = (import.meta.env?.VITE_API_URL || '').replace(/\/$/, '');
      const res = await fetch(`${apiUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Login gagal. Silakan coba lagi.');
      }

      login(data.token, data.user);
      navigate('/', { replace: true });
    } catch (err) {
      setErrorMsg(err.message || 'Tidak dapat terhubung ke server.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex h-dvh flex-col items-center justify-center overflow-y-auto overflow-x-hidden bg-gradient-to-br from-[#059669] via-[#10b981] to-[#34d399] font-sans lg:flex-row lg:items-stretch lg:justify-start lg:bg-none lg:bg-white">
      {/* Mobile: dekorasi */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.18)_0%,transparent_60%)] lg:hidden" />
      <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/10 lg:hidden" />
      <div className="pointer-events-none absolute -bottom-28 -left-24 h-80 w-80 rounded-full bg-white/10 lg:hidden" />

      {/* ── KIRI: gambar (desktop) ── */}
      <LoginHero />

      {/* ── KANAN: form ── */}
      <div className="relative flex w-full items-center justify-center overflow-hidden p-4 lg:flex-1 lg:p-10">
        <div className="pointer-events-none absolute right-0 top-0 hidden h-96 w-96 -translate-y-1/2 translate-x-1/2 rounded-full bg-emerald-500/5 blur-3xl lg:block" />
        <div className="pointer-events-none absolute bottom-0 left-0 hidden h-80 w-80 -translate-x-1/2 translate-y-1/2 rounded-full bg-emerald-500/5 blur-3xl lg:block" />

        <div className="relative w-full max-w-sm">
          {/* Mobile: brand bar */}
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 ring-1 ring-white/30">
              <Banknote className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold leading-none tracking-tight text-white">HO Finance</p>
              <p className="mt-0.5 text-xs font-bold uppercase tracking-wider text-white/80">Alora SuperApp</p>
            </div>
          </div>

          {/* Desktop: brand */}
          <div className="mb-6 hidden items-center gap-3 lg:flex">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-500 shadow-md shadow-emerald-600/20">
              <Banknote className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold leading-tight text-slate-800">HO Finance</p>
              <p className="text-xs font-semibold tracking-wider text-slate-400">Alora SuperApp</p>
            </div>
          </div>

          {/* Judul */}
          <div className="mb-5">
            <div className="mb-1 flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-white sm:text-2xl lg:text-slate-800">Selamat Datang</h2>
              <Sparkles className="h-4 w-4 text-white lg:text-emerald-500" />
            </div>
            <p className="text-xs text-white/90 sm:text-sm lg:text-slate-500">Masuk dengan akun Alora SuperApp Anda.</p>
          </div>

          {errorMsg && (
            <div className="animate-shake mb-4 flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/15 p-3 text-xs font-medium text-rose-100 lg:border-rose-100 lg:bg-rose-50 lg:text-rose-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-200 lg:text-rose-500" />
              <div>{errorMsg}</div>
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-3.5">
            <div className="space-y-1">
              <label className="block text-xs font-bold uppercase tracking-wider text-white/90 lg:text-slate-400" htmlFor="username">
                Username / Email
              </label>
              <div className="group relative">
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Masukkan username atau email"
                  className="block w-full rounded-xl border border-white/30 bg-white/20 py-2.5 pl-10 pr-4 text-sm font-medium text-white placeholder-white/70 backdrop-blur-sm transition-all duration-300 hover:border-white/30 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/20 lg:border-slate-200 lg:bg-white lg:py-3 lg:text-slate-800 lg:placeholder-slate-400/80 lg:hover:border-slate-300 lg:focus:ring-emerald-500/10"
                />
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <User className="h-4 w-4 text-white/90 transition-all duration-300 group-focus-within:text-white lg:text-slate-400 lg:group-focus-within:text-emerald-500" />
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold uppercase tracking-wider text-white/90 lg:text-slate-400" htmlFor="password">
                Kata Sandi
              </label>
              <div className="group relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan kata sandi"
                  className="block w-full rounded-xl border border-white/30 bg-white/20 py-2.5 pl-10 pr-10 text-sm font-medium text-white placeholder-white/70 backdrop-blur-sm transition-all duration-300 hover:border-white/30 focus:border-emerald-500 focus:outline-none focus:ring-4 focus:ring-emerald-500/20 lg:border-slate-200 lg:bg-white lg:py-3 lg:text-slate-800 lg:placeholder-slate-400/80 lg:hover:border-slate-300 lg:focus:ring-emerald-500/10"
                />
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
                  <Lock className="h-4 w-4 text-white/90 transition-all duration-300 group-focus-within:text-white lg:text-slate-400 lg:group-focus-within:text-emerald-500" />
                </div>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="p-1 text-white/90 transition-colors hover:text-white lg:text-slate-400 lg:hover:text-slate-600"
                    aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="group relative mt-2 flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-emerald-700 shadow-md shadow-emerald-900/20 transition-all duration-200 hover:shadow-lg active:scale-[0.98] disabled:opacity-60 lg:bg-gradient-to-r lg:from-emerald-700 lg:to-emerald-500 lg:py-3 lg:text-white lg:shadow-emerald-600/25 lg:hover:from-emerald-800 lg:hover:to-emerald-600"
            >
              <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-1000 group-hover:translate-x-full" />
              {isLoading ? (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  <span>Memproses...</span>
                </div>
              ) : (
                <>
                  <span>Masuk Ke Portal</span>
                  <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-xs font-medium text-white/80 lg:text-slate-400">
            &copy; 2026 Alora Group Indonesia. All rights reserved.
          </p>
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        .animate-shake { animation: shake 0.2s ease-in-out 2; }
      `}</style>
    </div>
  );
}
