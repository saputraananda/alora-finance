import express from 'express';
import { authenticateToken } from '../../middleware/auth.js';
import { getFinanceDashboard } from '../../controllers/dashboard/dashboard.controller.js';
import { getDashboardOverview } from '../../controllers/dashboard/overview.controller.js';
import { getOutletList, getPosSync, getSales, getPaymentMethods, getCashflow, getPurchasing } from '../../controllers/dashboard/widgets.controller.js';
import { getLayout, saveLayout, resetLayout } from '../../controllers/dashboard/layout.controller.js';

const router = express.Router();

router.use(authenticateToken);

// Semua endpoint menerima ?from=YYYY-MM-DD&to=YYYY-MM-DD (&outlet=ID)
router.get('/dashboard', getFinanceDashboard);                 // laba/rugi, beban, jurnal terkini (jurnal)
router.get('/dashboard/overview', getDashboardOverview);       // rekonsiliasi, perlu tindakan, aging, rekon & kas (POS + rekon)
router.get('/dashboard/outlets', getOutletList);               // daftar cabang untuk filter
router.get('/dashboard/pos-sync', getPosSync);                 // sinkronisasi POS: status posting per cabang
router.get('/dashboard/sales', getSales);                    // tren pendapatan per unit (POS)
router.get('/dashboard/payment-methods', getPaymentMethods);   // penjualan per metode bayar (POS)
router.get('/dashboard/cashflow', getCashflow);                // arus kas bank (jurnal)
router.get('/dashboard/purchasing', getPurchasing);            // biaya & pembayaran (Pengajuan SuperApp)

// Tampilan widget per pengguna
router.get('/dashboard/layout', getLayout);
router.put('/dashboard/layout', saveLayout);
router.delete('/dashboard/layout', resetLayout);

export default router;
