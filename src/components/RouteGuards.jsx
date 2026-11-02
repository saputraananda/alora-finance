import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';

/** Hanya untuk user yang sudah login (token ada). */
export function ProtectedRoute() {
  return localStorage.getItem('token') ? <Outlet /> : <Navigate to="/login" replace />;
}

/** Halaman khusus tamu (login); user yang sudah login diarahkan ke HO Finance. */
export function GuestRoute() {
  return localStorage.getItem('token') ? <Navigate to="/finance-ho" replace /> : <Outlet />;
}
