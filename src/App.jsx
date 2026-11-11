import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import Login from './pages/auth/login.jsx';
import { ProtectedRoute, GuestRoute } from './components/RouteGuards.jsx';
import FinanceLayout from './components/FinanceLayout.jsx';
import DashboardFinance from './pages/dashboard';
import Rekonsiliasi from './pages/rekonsiliasi';
import JurnalUmum from './pages/journal';
import BukuBesar from './pages/general-ledger';
import COA from './pages/coa';
import AnggaranBeban from './pages/budgets';
import Home from './pages/home';
import PosIntegration from './pages/pos-integration';
import Pengaturan from './pages/settings';
import LaporanKeuangan from './pages/reports';
import DepositMember from './pages/customers/DepositMember';
import TutupBuku from './pages/closing';
import AsetTetap from './pages/fixed-assets';
import Pengajuan from './pages/purchasing/Pengajuan';
import Pembayaran from './pages/purchasing/Pembayaran';
import Kredit from './pages/purchasing/Kredit';
import Klasifikasi from './pages/purchasing/Klasifikasi';

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
            <Route element={<FinanceLayout />}>
              <Route path="/finance-ho/dashboard" element={<DashboardFinance />} />
              <Route path="/finance-ho/integrasi-pos" element={<PosIntegration />} />
              <Route path="/finance-ho/pengaturan" element={<Pengaturan />} />
              <Route path="/finance-ho/laporan" element={<LaporanKeuangan />} />
              <Route path="/finance-ho/pelanggan/deposit" element={<DepositMember />} />
              <Route path="/finance-ho/tutup-buku" element={<TutupBuku />} />
              <Route path="/finance-ho/pembelian" element={<Navigate to="/finance-ho/pembelian/pengajuan" replace />} />
              <Route path="/finance-ho/pembelian/pengajuan" element={<Pengajuan />} />
              <Route path="/finance-ho/pembelian/pembayaran" element={<Pembayaran />} />
              <Route path="/finance-ho/pembelian/kredit" element={<Kredit />} />
              <Route path="/finance-ho/pembelian/klasifikasi" element={<Klasifikasi />} />
              <Route path="/finance-ho/aset-tetap" element={<AsetTetap />} />
              <Route path="/finance-ho/rekonsiliasi" element={<Rekonsiliasi />} />
              <Route path="/finance-ho/jurnal-umum" element={<JurnalUmum />} />
              <Route path="/finance-ho/buku-besar" element={<BukuBesar />} />
              <Route path="/finance-ho/coa" element={<COA />} />
              <Route path="/finance-ho/anggaran-beban" element={<AnggaranBeban />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </Router>
  );
}

export default App;
