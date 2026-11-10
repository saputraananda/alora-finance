import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HiOutlineChartBar,
  HiOutlineComputerDesktop,
  HiOutlineBookOpen,
  HiOutlineScale,
  HiOutlineUsers,
  HiOutlineWallet,
  HiOutlineShoppingCart,
  HiOutlineCube,
  HiOutlineBuildingOffice2,
  HiOutlineDocumentChartBar,
  HiOutlineLockClosed,
  HiOutlineCog6Tooth,
  HiOutlineBanknotes,
  HiOutlineArrowRightOnRectangle,
} from 'react-icons/hi2';
import { clearSession } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';

// 12 menu utama sesuai referensi tim finance.
// status: 'ready' = halaman sudah ada & bisa diklik, 'soon' = belum tersedia.
// `group` disiapkan bila nanti menu dikelompokkan per modul.
const MENU_ITEMS = [
  { key: 'dashboard', group: 'dashboard', path: '/finance-ho/dashboard', label: 'Dashboard', hint: 'Ringkasan Semua Cabang', status: 'ready', icon: HiOutlineChartBar, iconWrap: 'bg-emerald-50 text-emerald-700 group-hover:bg-emerald-100/70', labelHover: 'group-hover:text-emerald-700' },
  { key: 'integrasi-pos', group: 'front-office', path: '/finance-ho/integrasi-pos', label: 'Integrasi POS', hint: 'Sinkronisasi & Batch', status: 'ready', icon: HiOutlineComputerDesktop, iconWrap: 'bg-sky-50 text-sky-700 group-hover:bg-sky-100/70', labelHover: 'group-hover:text-sky-700' },
  { key: 'jurnal', group: 'general-ledger', path: '/finance-ho/jurnal-umum', label: 'Jurnal', hint: 'Jurnal Umum & Manual', status: 'ready', icon: HiOutlineBookOpen, iconWrap: 'bg-teal-50 text-teal-700 group-hover:bg-teal-100/70', labelHover: 'group-hover:text-teal-700' },
  { key: 'rekonsiliasi', group: 'front-office', path: '/finance-ho/rekonsiliasi', label: 'Rekonsiliasi', hint: 'Settlement, Kas & Bank', status: 'ready', icon: HiOutlineScale, iconWrap: 'bg-indigo-50 text-indigo-700 group-hover:bg-indigo-100/70', labelHover: 'group-hover:text-indigo-700' },
  { key: 'pelanggan', group: 'front-office', path: '/finance-ho/pelanggan/deposit', label: 'Pelanggan', hint: 'Deposit Member', status: 'ready', icon: HiOutlineUsers, iconWrap: 'bg-rose-50 text-rose-700 group-hover:bg-rose-100/70', labelHover: 'group-hover:text-rose-700' },
  { key: 'kas-kecil', group: 'front-office', path: '/finance-ho/kas-kecil', label: 'Kas Kecil', hint: 'Pengeluaran & Isi Ulang', status: 'soon', icon: HiOutlineWallet, iconWrap: 'bg-amber-50 text-amber-700 group-hover:bg-amber-100/70', labelHover: 'group-hover:text-amber-700' },
  { key: 'pembelian', group: 'purchasing', path: '/finance-ho/pembelian', label: 'Pembelian', hint: 'Pesanan, Faktur & Hutang', status: 'soon', icon: HiOutlineShoppingCart, iconWrap: 'bg-orange-50 text-orange-700 group-hover:bg-orange-100/70', labelHover: 'group-hover:text-orange-700' },
  { key: 'persediaan', group: 'inventory', path: '/finance-ho/persediaan', label: 'Persediaan', hint: 'Stok, Transfer & Opname', status: 'soon', icon: HiOutlineCube, iconWrap: 'bg-lime-50 text-lime-700 group-hover:bg-lime-100/70', labelHover: 'group-hover:text-lime-700' },
  { key: 'aset-tetap', group: 'fixed-asset', path: '/finance-ho/aset-tetap', label: 'Aset Tetap', hint: 'Daftar & Penyusutan', status: 'ready', icon: HiOutlineBuildingOffice2, iconWrap: 'bg-violet-50 text-violet-700 group-hover:bg-violet-100/70', labelHover: 'group-hover:text-violet-700' },
  { key: 'laporan', group: 'report-setup', path: '/finance-ho/laporan', label: 'Laporan', hint: 'Laporan Keuangan & Buku Besar', status: 'ready', icon: HiOutlineDocumentChartBar, iconWrap: 'bg-cyan-50 text-cyan-700 group-hover:bg-cyan-100/70', labelHover: 'group-hover:text-cyan-700' },
  { key: 'tutup-buku', group: 'general-ledger', path: '/finance-ho/tutup-buku', label: 'Tutup Buku', hint: 'Checklist Periode', status: 'ready', icon: HiOutlineLockClosed, iconWrap: 'bg-fuchsia-50 text-fuchsia-700 group-hover:bg-fuchsia-100/70', labelHover: 'group-hover:text-fuchsia-700' },
  { key: 'pengaturan', group: 'report-setup', path: '/finance-ho/pengaturan', label: 'Pengaturan', hint: 'Cabang, Metode Bayar & Akun', status: 'ready', icon: HiOutlineCog6Tooth, iconWrap: 'bg-slate-100 text-slate-700 group-hover:bg-slate-200/70', labelHover: 'group-hover:text-slate-700' },
];

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem('user') || '{}') || {};
  } catch {
    return {};
  }
}

function greeting() {
  const h = new Date().getHours();
  if (h >= 3 && h < 11) return 'Selamat Pagi,';
  if (h >= 11 && h < 15) return 'Selamat Siang,';
  if (h >= 15 && h < 18) return 'Selamat Sore,';
  return 'Selamat Malam,';
}

const SLOGANS = [
  'Pilih menu untuk mulai bekerja hari ini',
  'Catat rapi, tutup buku tenang',
  'Angka akurat, keputusan tepat',
  'Satu pintu untuk seluruh keuangan HO',
];

export default function Home() {
  const navigate = useNavigate();
  const { user: authUser, logout } = useAuth();
  const user = authUser || getStoredUser();
  const fullName = user.fullName || user.name || user.username || 'User';
  const department = user.department || user.position || 'Portal User';
  const [sloganIndex, setSloganIndex] = useState(0);

  const today = new Date().toLocaleDateString('id-ID', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  useEffect(() => {
    document.title = 'Beranda | HO Finance';
    const t = setInterval(() => setSloganIndex((i) => (i + 1) % SLOGANS.length), 4500);
    return () => clearInterval(t);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden bg-slate-50 font-sans text-slate-800 antialiased">
      {/* Brand glow halus */}
      <div className="pointer-events-none absolute -left-64 -top-64 h-[500px] w-[500px] rounded-full bg-emerald-600/5 blur-[150px]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[500px] w-[500px] rounded-full bg-teal-500/5 blur-[150px]" />

      {/* Top navbar */}
      <header className="relative z-30 border-b border-slate-200/70 bg-white">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-500 shadow-md shadow-emerald-600/20">
              <HiOutlineBanknotes className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-extrabold tracking-tight text-slate-800">HO Finance</p>
              <p className="truncate text-[11px] text-slate-400">Alora SuperApp</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-xs font-bold leading-none text-slate-800">{fullName}</p>
              <p className="mt-1 text-[11px] leading-none text-slate-400">{department}</p>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-slate-700 transition-all hover:border-rose-300 hover:text-rose-600 sm:px-3 sm:py-2 sm:text-xs"
            >
              <HiOutlineArrowRightOnRectangle className="h-4 w-4" />
              <span>Keluar</span>
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-[1600px] flex-grow flex-col gap-5 p-3 sm:p-4 lg:gap-6 lg:p-6">
        {/* Banner */}
        <div
          className="group relative overflow-hidden rounded-2xl border border-emerald-900/40 p-5 text-white shadow-xl shadow-emerald-900/20 sm:rounded-3xl sm:p-8"
          style={{
            backgroundImage: `
              radial-gradient(rgba(255, 255, 255, 0.08) 1.5px, transparent 1.5px),
              radial-gradient(rgba(255, 255, 255, 0.04) 1.5px, transparent 1.5px),
              linear-gradient(to right, #022c22, #065f46, #064e3b)
            `,
            backgroundSize: '28px 28px, 14px 14px, 100% 100%',
            backgroundPosition: '0 0, 14px 14px, 0 0',
          }}
        >
          <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-emerald-400/10 blur-3xl transition-transform duration-700 group-hover:scale-125" />
          <p className="relative text-[11px] font-semibold uppercase tracking-widest text-emerald-100/70">{today}</p>
          <h1 className="relative mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">
            {greeting()} <span className="text-emerald-300">{fullName}</span>
          </h1>
          <p key={sloganIndex} className="relative mt-2 text-xs text-emerald-100/80 sm:text-sm">
            {SLOGANS[sloganIndex]}
          </p>
        </div>

        {/* Menu cepat */}
        <div>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Menu Utama Finance HO</h3>
          </div>
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
            {MENU_ITEMS.map((item) => {
              const Icon = item.icon;
              const soon = item.status === 'soon';
              return (
                <button
                  key={item.key}
                  type="button"
                  disabled={soon}
                  onClick={() => navigate(item.path)}
                  className={`group flex flex-col items-center rounded-2xl border border-slate-200/80 bg-white p-4 text-center transition-all duration-300 ${
                    soon
                      ? 'cursor-not-allowed opacity-70'
                      : 'cursor-pointer transform hover:-translate-y-1 hover:border-emerald-600/60 hover:shadow-md'
                  }`}
                >
                  <div className={`mb-2.5 rounded-2xl p-3 transition-all duration-200 ${soon ? '' : 'group-hover:scale-110'} ${item.iconWrap}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <span className={`text-xs font-bold text-slate-800 transition-colors ${soon ? '' : item.labelHover}`}>
                    {item.label}
                  </span>
                  <span className="mt-1 hidden text-[9px] text-slate-400 sm:inline">
                    {soon ? 'Segera hadir' : item.hint}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
