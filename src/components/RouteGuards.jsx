import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

/**
 * Loading screen yang ditampilkan saat memverifikasi sesi login
 */
function AuthLoadingScreen() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-slate-50 font-sans">
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-500 shadow-lg shadow-emerald-600/20">
          <svg className="h-6 w-6 animate-spin text-white" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
        <p className="text-xs font-semibold tracking-wider text-slate-500 uppercase">
          Memverifikasi Sesi...
        </p>
      </div>
    </div>
  );
}

/**
 * Hanya untuk user yang sudah login dan terverifikasi di server.
 * Jika belum login atau token kadaluwarsa, wajib login terlebih dahulu (/login).
 */
export function ProtectedRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <AuthLoadingScreen />;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}

/**
 * Halaman khusus tamu (login).
 * Jika user sudah login & sesi valid, diarahkan ke halaman utama (/).
 */
export function GuestRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return <AuthLoadingScreen />;
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
