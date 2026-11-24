import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import Login from './pages/auth/login.jsx';
import { ProtectedRoute, GuestRoute } from './components/RouteGuards.jsx';
import FinanceLayout from './components/FinanceLayout.jsx';
import DashboardFinance from './pages/dashboard';
import Rekonsiliasi from './pages/rekonsiliasi';
import GeneralLedgerHub from './pages/general-ledger/Hub';
import JurnalManual from './pages/journal/FormJurnalManual';
import COA from './pages/coa';
import AnggaranBeban from './pages/budgets';
import Home from './pages/home';
import PosIntegration from './pages/pos-integration';
import Pengaturan from './pages/settings';
import LaporanKeuangan from './pages/reports';
import DepositMember from './pages/customers/DepositMember';
import DaftarCustomer from './pages/customers/DaftarCustomer';
import AsetTetap from './pages/fixed-assets';
import Pengajuan from './pages/purchasing/Pengajuan';
import Pembayaran from './pages/purchasing/Pembayaran';
import Kredit from './pages/purchasing/Kredit';

// Halaman HO Finance. Path RELATIF terhadap "/finance-ho/*": dirender oleh FinanceLayout sebagai tab
// (tiap tab membawa alamatnya sendiri), sehingga halaman yang tidak aktif tetap hidup di belakang layar.
const FINANCE_ROUTES = [
  { path: 'dashboard', element: <DashboardFinance /> },
  { path: 'tab-baru', element: <Home embedded /> }, // isi tab baru (tombol +)
  { path: 'integrasi-pos', element: <PosIntegration /> },
  { path: 'pengaturan/*', element: <Pengaturan /> },
  { path: 'laporan', element: <LaporanKeuangan /> },
  { path: 'pelanggan/daftar', element: <DaftarCustomer /> },
  { path: 'pelanggan/deposit', element: <DepositMember /> },
  { path: 'pembelian/pengajuan', element: <Pengajuan /> },
  { path: 'pembelian/pembayaran', element: <Pembayaran /> },
  { path: 'pembelian/kredit', element: <Kredit /> },
  { path: 'aset-tetap', element: <AsetTetap /> },
  { path: 'rekonsiliasi', element: <Rekonsiliasi /> },
  { path: 'general-ledger', element: <GeneralLedgerHub /> },
  { path: 'jurnal-umum/baru', element: <JurnalManual /> },
  { path: 'jurnal-umum/:id/ubah', element: <JurnalManual /> },
  { path: 'coa', element: <COA /> },
  { path: 'anggaran-beban', element: <AnggaranBeban /> },
];

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          {/* Guest routes (diarahkan ke HO Finance bila sudah login) */}
          <Route element={<GuestRoute />}>
            <Route path="/login" element={<Login />} />
          </Route>

          {/* HO Finance (wajib login) */}
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Home />} />
            <Route path="/finance-ho" element={<Navigate to="/" replace />} />
            <Route path="/finance-ho/pembelian" element={<Navigate to="/finance-ho/pembelian/pengajuan" replace />} />
            <Route path="/finance-ho/*" element={<FinanceLayout routes={FINANCE_ROUTES} />} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
