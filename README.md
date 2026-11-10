# Alora Finance 

Aplikasi **HO Finance** Alora 

## Struktur

Folder dibagi **per fitur** (mengikuti pola waschen-mobile). Acuan konvensi kode ada di `aiAgent/StrukturCode.MD`.

```
├── api/
│   ├── controllers/   # satu folder per fitur: <fitur>/<fitur>.controller.js
│   │   ├── auth/        # login, me
│   │   ├── dashboard/   # dashboard finance
│   │   ├── coa/         # master COA
│   │   ├── budgets/     # anggaran beban
│   │   ├── journal/     # jurnal umum
│   │   └── ledger/      # buku besar (general ledger)
│   ├── routes/        # struktur sama dengan controllers: <fitur>/<fitur>.routes.js
│   ├── middleware/    # auth.js (JWT)
│   ├── db/            # pool.js (mainPool & alfiPool)
│   └── utils/         # currencyHelpers.js
├── src/
│   ├── pages/         # satu folder per halaman, masing-masing index.jsx
│   │   ├── auth/          # login
│   │   ├── dashboard/
│   │   ├── rekonsiliasi/
│   │   ├── jurnal-umum/
│   │   ├── buku-besar/
│   │   ├── coa/
│   │   └── anggaran-beban/
│   ├── components/    # FinanceLayout (sidebar + topbar), RouteGuards,
│   │                  # DetailJurnalModal, ModalFormAkun (dipakai lintas halaman)
│   └── lib/api.js     # wrapper fetch + token
├── aiAgent/           # dokumentasi konvensi (StrukturCode.MD)
├── server.js          # Entry point Express
└── vite.config.js
```

## Routing

| Halaman (frontend) | Prefix API |
| --- | --- |
| `/login` | `/api/auth` |
| `/finance-ho/dashboard`, `/rekonsiliasi`, `/jurnal-umum`, `/buku-besar`, `/coa`, `/anggaran-beban` | `/api/finance-ho/*` |

Semua halaman `/finance-ho/*` wajib login (`ProtectedRoute`). Token JWT disimpan di `localStorage` (`token`, `user`), berlaku 12 jam.

## Menjalankan

```bash
npm install
cp .env.example .env   # isi kredensial database
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:5000
- Production memakai `.env.prod` (dipilih otomatis saat `NODE_ENV=production`).

## Environment

| Variabel | Fungsi |
| --- | --- |
| `PORT`, `NODE_ENV`, `CORS_ORIGIN` | Konfigurasi server |
| `SESSION_SECRET` | Secret penanda tangan JWT |
| `DB_*` | Database SuperApp (read-only) |
| `DB_*_ALFI` | Database Alfi |

## Database

- `mainPool` — database SuperApp (read-only; `users`, `mst_employee`, `mst_position`, `mst_department`) untuk login SSO.
- `alfiPool` — database Alfi: `alfi` (development) / `alfi_prod` (production). Tabel `tr_*` dibuat otomatis oleh controller.

## Scripts

| Script | Deskripsi |
| --- | --- |
| `npm run dev` | Server & client bersamaan |
| `npm run dev:server` | Backend saja (nodemon) |
| `npm run dev:client` | Frontend saja (Vite) |
| `npm run build` | Build frontend |
| `npm start` | Jalankan server (production) |

## Database
Skema (CREATE TABLE) dan data awal disimpan di repo privat terpisah **alfi-database**, bukan di repo ini. Server tidak membuat tabel sendiri; jalankan `schema.sql` lalu `seed.sql` dari repo tersebut pada database kosong.
