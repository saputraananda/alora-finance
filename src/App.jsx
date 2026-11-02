import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/auth/login.jsx';
import { ProtectedRoute, GuestRoute } from './components/RouteGuards.jsx';
import FinanceLayout from './components/FinanceLayout.jsx';
import DashboardFinance from './pages/dashboard';
import Rekonsiliasi from './pages/rekonsiliasi';
import JurnalUmum from './pages/jurnal-umum';
import BukuBesar from './pages/buku-besar';
import COA from './pages/coa';
import AnggaranBeban from './pages/anggaran-beban';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to="/finance-ho" replace />} />

        {/* Guest routes (diarahkan ke HO Finance bila sudah login) */}
        <Route element={<GuestRoute />}>
          <Route path="/login" element={<Login />} />
        </Route>

        {/* HO Finance (wajib login) */}
        <Route element={<ProtectedRoute />}>
          <Route element={<FinanceLayout />}>
            <Route path="/finance-ho" element={<Navigate to="/finance-ho/dashboard" replace />} />
            <Route path="/finance-ho/dashboard" element={<DashboardFinance />} />
            <Route path="/finance-ho/rekonsiliasi" element={<Rekonsiliasi />} />
            <Route path="/finance-ho/jurnal-umum" element={<JurnalUmum />} />
            <Route path="/finance-ho/buku-besar" element={<BukuBesar />} />
            <Route path="/finance-ho/coa" element={<COA />} />
            <Route path="/finance-ho/anggaran-beban" element={<AnggaranBeban />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
