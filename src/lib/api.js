// Wrapper fetch ke backend Alfi. Semua path dipanggil tanpa prefix "/api"
// (mis. api("/finance-ho/accounts")), prefix ditambahkan di sini.
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export const getToken = () => localStorage.getItem('token');

export function clearSession() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

export async function api(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: 'Network error' }));
    // Token tidak valid / kadaluwarsa -> kembali ke login
    if ((res.status === 401 || res.status === 403) && token) {
      clearSession();
      window.location.replace('/login');
    }
    throw new Error(err.message || 'Request failed');
  }

  return res.json();
}
