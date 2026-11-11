// Wrapper fetch ke backend Alfi. Semua path dipanggil tanpa prefix "/api"
// (mis. api("/finance-ho/accounts")), prefix ditambahkan di sini.
const API_BASE = (
  typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL
    ? import.meta.env.VITE_API_URL
    : ''
).replace(/\/$/, '');

export const getToken = () => {
  const token = localStorage.getItem('token');
  if (!token || token === 'null' || token === 'undefined' || token.trim() === '') {
    return null;
  }
  return token;
};

export function clearSession() {
  try {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
  } catch {}
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
    // Token tidak valid / kadaluwarsa -> kembali ke login.
    // 403 dengan code NO_ACCESS = login sah tetapi tidak punya hak menu itu: JANGAN dikeluarkan.
    if (res.status === 401 || (res.status === 403 && err.code !== 'NO_ACCESS')) {
      clearSession();
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.replace('/login');
      }
    }
    throw new Error(err.message || 'Request failed');
  }

  return res.json();
}
