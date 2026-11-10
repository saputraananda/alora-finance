import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import authRoutes from './api/routes/auth/auth.routes.js';
import financeDashboardRoutes from './api/routes/dashboard/dashboard.routes.js';
import financeBudgetsRoutes from './api/routes/budgets/budgets.routes.js';
import financeCoaRoutes from './api/routes/coa/coa.routes.js';
import financeJournalRoutes from './api/routes/journal/journal.routes.js';
import financeGeneralLedgerRoutes from './api/routes/ledger/ledger.routes.js';

import financePosRoutes from './api/routes/pos/pos.routes.js';
import financeRekonRoutes from './api/routes/rekon/rekon.routes.js';
import financeSettingsRoutes from './api/routes/settings/settings.routes.js';
import financeReportsRoutes from './api/routes/reports/reports.routes.js';
import financeCustomersRoutes from './api/routes/customers/customers.routes.js';
import financeClosingRoutes from './api/routes/closing/closing.routes.js';
import financeAssetsRoutes from './api/routes/assets/assets.routes.js';
import { startPosSyncScheduler } from './api/jobs/posSync.js';

// Resolve directory paths in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Lampiran jurnal (nama file acak, tidak bisa ditebak)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/finance-ho', financeDashboardRoutes);
app.use('/api/finance-ho', financeBudgetsRoutes);
app.use('/api/finance-ho', financeCoaRoutes);
app.use('/api/finance-ho', financeJournalRoutes);
app.use('/api/finance-ho', financeGeneralLedgerRoutes);
app.use('/api/finance-ho', financePosRoutes);
app.use('/api/finance-ho', financeRekonRoutes);
app.use('/api/finance-ho', financeSettingsRoutes);
app.use('/api/finance-ho', financeReportsRoutes);
app.use('/api/finance-ho', financeCustomersRoutes);
app.use('/api/finance-ho', financeClosingRoutes);
app.use('/api/finance-ho', financeAssetsRoutes);

// Serve static assets in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')));

  // Wildcard handler for client side routing
  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
  });
} else {
  app.get('/', (req, res) => {
    res.send('Alfi API Server is running. Frontend dev server is active on port 5173.');
  });
}

// Start Server
app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`  Alfi Server                              `);
  console.log(`  Status: Running                        `);
  console.log(`  Port:   http://localhost:${PORT}        `);
  console.log(`=========================================`);
  startPosSyncScheduler();
});
