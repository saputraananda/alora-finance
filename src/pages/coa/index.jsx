import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  HiOutlinePlus,
  HiOutlineMagnifyingGlass,
  HiOutlineXMark,
  HiOutlineSparkles,
  HiOutlineNumberedList,
} from "react-icons/hi2";
import { api } from "../../lib/api";
import ModalFormAkun from "../../components/ModalFormAkun";

function cn(...classes) {
  return classes.filter(Boolean).join(" ");
}

function formatSaldo(num) {
  if (num === null || num === undefined || isNaN(num)) return "";
  const n = Number(num);
  if (n === 0) return "";
  const formatted = new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(n));
  return n < 0 ? `(${formatted})` : formatted;
}

const TYPE_CONFIG = {
  ASET: { label: "Aset", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  KEWAJIBAN: { label: "Kewajiban", color: "bg-rose-50 text-rose-700 border-rose-200" },
  EKUITAS: { label: "Ekuitas", color: "bg-purple-50 text-purple-700 border-purple-200" },
  PENDAPATAN: { label: "Pendapatan", color: "bg-blue-50 text-blue-700 border-blue-200" },
  BEBAN: { label: "Beban", color: "bg-amber-50 text-amber-700 border-amber-200" },
};

const FILTER_PILLS = [
  { id: "", label: "Semua" },
  { id: "ASET", label: "Aset" },
  { id: "KEWAJIBAN", label: "Kewajiban" },
  { id: "EKUITAS", label: "Ekuitas" },
  { id: "PENDAPATAN", label: "Pendapatan" },
  { id: "BEBAN", label: "Beban" },
];

export default function COA() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedType, setSelectedType] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [message, setMessage] = useState(null);

  // Load data akun
  const loadAccounts = async () => {
    setLoading(true);
    try {
      const res = await api("/finance-ho/accounts");
      const list = res.data || [];
      setAccounts(list);
      // Default pilih akun pertama jika belum ada yang terpilih
      if (list.length > 0 && !selectedAccountId) {
        setSelectedAccountId(list[0].id);
      }
    } catch (err) {
      console.error("Gagal load akun:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  // Lookup map untuk parent-child hierarchy
  const accountMap = useMemo(() => {
    const map = {};
    accounts.forEach((a) => {
      map[a.id] = a;
    });
    return map;
  }, [accounts]);

  // Hitung kedalaman hierarki (0 = Kategori utama, 1 = Sub-header / Induk grup, 2 = Akun detail)
  const getAccountLevel = (acc) => {
    if (acc.is_header && !acc.parent_id) return 0;
    let lvl = 0;
    let curr = acc;
    while (curr && curr.parent_id && accountMap[curr.parent_id] && lvl < 3) {
      lvl++;
      curr = accountMap[curr.parent_id];
    }
    return lvl;
  };

  // Filter akun berdasarkan pencarian dan tipe
  const filteredAccounts = useMemo(() => {
    return accounts.filter((acc) => {
      const matchSearch =
        !search ||
        acc.code.toLowerCase().includes(search.toLowerCase()) ||
        acc.name.toLowerCase().includes(search.toLowerCase());
      const matchType = !selectedType || acc.type === selectedType;
      return matchSearch && matchType;
    });
  }, [accounts, search, selectedType]);

  // Akun terpilih untuk detail panel
  const selectedAccount = useMemo(() => {
    if (!selectedAccountId) return filteredAccounts[0] || null;
    return accounts.find((a) => a.id === selectedAccountId) || filteredAccounts[0] || null;
  }, [accounts, selectedAccountId, filteredAccounts]);

  // Handle seed default
  const handleSeedDefault = async () => {
    setSeeding(true);
    setMessage(null);
    try {
      const res = await api("/finance-ho/accounts/seed-default", { method: "POST" });
      setMessage({ type: "success", text: res.message || "Akun standar berhasil dimuat!" });
      loadAccounts();
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Gagal memuat akun standar." });
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/60 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* ── Header Banner Seragam ────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-3xl border border-emerald-300/30 bg-gradient-to-r from-[#059669] to-[#6EE7B7] p-6 shadow-sm">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/20 blur-3xl pointer-events-none" />
        <div className="absolute -left-20 bottom-0 h-56 w-56 rounded-full bg-teal-200/25 blur-3xl pointer-events-none" />

        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20 border border-white/30 text-white shadow-inner backdrop-blur-xs">
              <HiOutlineNumberedList className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white sm:text-2xl drop-shadow-xs">
                Daftar Akun (COA)
              </h1>
              <p className="text-xs sm:text-sm text-emerald-50 mt-0.5 font-medium drop-shadow-xs">
                Chart of Account · data contoh
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {accounts.length === 0 && (
              <button
                type="button"
                onClick={handleSeedDefault}
                disabled={seeding || loading}
                className="inline-flex items-center gap-1.5 rounded-xl bg-white/90 hover:bg-white px-3.5 py-2 text-xs font-bold text-emerald-900 transition shadow-sm disabled:opacity-50"
              >
                <HiOutlineSparkles className="h-4 w-4 text-emerald-600" />
                {seeding ? "Memuat..." : "Muat Akun Standar"}
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setEditingAccount(null);
                setModalOpen(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-white hover:bg-emerald-50 px-4 py-2.5 text-xs sm:text-sm font-bold text-emerald-800 transition shadow-md shadow-emerald-950/10 active:scale-95"
            >
              <HiOutlinePlus className="h-4 w-4 stroke-[2.5]" />
              Akun baru
            </button>
          </div>
        </div>
      </section>

      {/* Alert Message */}
      {message && (
        <div
          className={cn(
            "flex items-center justify-between rounded-xl p-3.5 text-xs font-medium shadow-xs",
            message.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-rose-50 text-rose-800 border border-rose-200"
          )}
        >
          <span>{message.text}</span>
          <button
            type="button"
            onClick={() => setMessage(null)}
            className="p-1 hover:opacity-70 text-slate-500"
          >
            <HiOutlineXMark className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* ── Main Layout: Split 2 Kolom (Semua Akun + Detail Akun) ─────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Kolom Kiri: Tabel Semua Akun (8 Kolom Desktop) */}
        <div className="lg:col-span-8 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-4">
          <h2 className="text-base font-bold text-slate-800">Semua akun</h2>

          {/* Search Box */}
          <div className="relative">
            <HiOutlineMagnifyingGlass className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Cari kode atau nama akun"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-xs sm:text-sm text-slate-700 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
            />
          </div>

          {/* Filter Pills (Rounded Pills persis seperti mockup) */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            {FILTER_PILLS.map((pill) => {
              const active = selectedType === pill.id;
              return (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => setSelectedType(pill.id)}
                  className={cn(
                    "px-4 py-1.5 rounded-full text-xs font-medium transition shrink-0 border",
                    active
                      ? "border-[#0d5c46] bg-[#e6f4ea] text-[#0d5c46] font-bold shadow-xs"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                  )}
                >
                  {pill.label}
                </button>
              );
            })}
          </div>

          {/* Tabel Akun */}
          <div className="overflow-x-auto pt-1">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-3 w-28">No. akun</th>
                  <th className="py-3 px-3">Nama akun</th>
                  <th className="py-3 px-3 w-28">Tipe</th>
                  <th className="py-3 px-3 w-28">Saldo normal</th>
                  <th className="py-3 px-3 text-right w-36">Saldo (Rp)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {loading ? (
                  <tr>
                    <td colSpan="5" className="py-12 text-center text-slate-400">
                      Memuat daftar akun...
                    </td>
                  </tr>
                ) : filteredAccounts.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="py-12 text-center text-slate-400">
                      <p className="font-semibold text-slate-600">Tidak ada akun yang ditemukan</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Coba sesuaikan kata kunci pencarian atau filter tipe.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredAccounts.map((acc) => {
                    const isSelected = selectedAccount?.id === acc.id;
                    const level = getAccountLevel(acc);
                    const isTopHeader = acc.is_header === 1 && !acc.parent_id;
                    const typeLabel = TYPE_CONFIG[acc.type]?.label || acc.type;
                    const normalLabel = acc.normal_balance === "DEBIT" ? "Debit" : "Kredit";

                    // 1. Baris Kategori Utama (e.g. 1-0000 ASET, 2-0000 KEWAJIBAN, etc.)
                    // Di mockup: Tipe, Saldo normal, dan Saldo kosong (blank)
                    if (isTopHeader) {
                      return (
                        <tr
                          key={acc.id}
                          onClick={() => setSelectedAccountId(acc.id)}
                          className={cn(
                            "cursor-pointer transition border-b border-slate-100",
                            isSelected
                              ? "bg-[#e6f4ea] text-emerald-950 font-bold"
                              : "hover:bg-slate-50/60 font-bold text-slate-900"
                          )}
                        >
                          <td className="py-3 px-3 font-mono text-slate-800 font-semibold">{acc.code}</td>
                          <td className="py-3 px-3 uppercase tracking-wider font-extrabold text-slate-900">
                            {acc.name}
                          </td>
                          <td className="py-3 px-3"></td>
                          <td className="py-3 px-3"></td>
                          <td className="py-3 px-3 text-right"></td>
                        </tr>
                      );
                    }

                    // 2. Baris Sub-Header atau Akun Normal dengan Indentasi Hirarki
                    return (
                      <tr
                        key={acc.id}
                        onClick={() => setSelectedAccountId(acc.id)}
                        className={cn(
                          "cursor-pointer transition border-b border-slate-50",
                          isSelected
                            ? "bg-[#e6f4ea] text-emerald-950"
                            : "hover:bg-slate-50/70 text-slate-700"
                        )}
                      >
                        <td className={cn("py-3 px-3 font-mono text-xs", isSelected ? "font-semibold text-[#0d5c46]" : "text-slate-600")}>
                          {acc.code}
                        </td>
                        <td
                          className={cn(
                            "py-3 px-3",
                            level === 1
                              ? "pl-6 font-medium text-slate-800"
                              : level >= 2
                              ? "pl-10 font-normal text-slate-700"
                              : "font-medium text-slate-800",
                            isSelected && "font-bold text-[#0d5c46]"
                          )}
                        >
                          {acc.name}
                        </td>
                        <td className="py-3 px-3 text-slate-600 text-xs">{typeLabel}</td>
                        <td className="py-3 px-3 text-slate-600 text-xs">{normalLabel}</td>
                        <td
                          className={cn(
                            "py-3 px-3 text-right font-mono text-xs",
                            isSelected ? "font-bold text-[#0d5c46]" : "font-medium text-slate-800"
                          )}
                        >
                          {formatSaldo(acc.balance)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Kolom Kanan: Card Detail Akun (4 Kolom Desktop, Sticky) */}
        <div className="lg:col-span-4 sticky top-6">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h2 className="text-base font-bold text-slate-900">Detail akun</h2>
              {selectedAccount && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingAccount(selectedAccount);
                    setModalOpen(true);
                  }}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 transition shadow-xs"
                >
                  Edit
                </button>
              )}
            </div>

            {selectedAccount ? (
              <div className="space-y-3.5 text-xs sm:text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">No. akun</span>
                  <span className="font-mono font-medium text-slate-800">
                    {selectedAccount.code}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-2">
                  <span className="text-slate-500">Nama</span>
                  <span className="font-bold text-slate-900 text-right">
                    {selectedAccount.name}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">Tipe</span>
                  <span className="font-normal text-slate-800">
                    {TYPE_CONFIG[selectedAccount.type]?.label || selectedAccount.type}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">Saldo normal</span>
                  <span className="font-normal text-slate-800">
                    {selectedAccount.normal_balance === "DEBIT" ? "Debit" : "Kredit"}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">Parent</span>
                  <span className="text-slate-700">
                    {selectedAccount.parent_name
                      ? `${selectedAccount.parent_code || ""} ${selectedAccount.parent_name}`
                      : "-"}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-500">Status</span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                      selectedAccount.is_active === 1
                        ? "bg-[#e6f4ea] text-[#0d5c46]"
                        : "bg-slate-100 text-slate-500"
                    )}
                  >
                    {selectedAccount.is_active === 1 ? "Aktif" : "Nonaktif"}
                  </span>
                </div>

                <div className="flex items-start justify-between gap-2">
                  <span className="text-slate-500">Memo</span>
                  <span className="text-slate-700 text-right max-w-[65%] truncate" title={selectedAccount.memo}>
                    {selectedAccount.memo || "-"}
                  </span>
                </div>

                {/* Tombol Lihat di Buku Besar */}
                <div className="pt-3">
                  <Link
                    to={`/finance-ho/buku-besar?account_id=${selectedAccount.id}`}
                    className="flex w-full items-center justify-center rounded-lg border border-[#0d5c46] bg-white py-2.5 px-4 text-xs sm:text-sm font-semibold text-[#0d5c46] hover:bg-[#e6f4ea]/40 transition shadow-xs"
                  >
                    <span>Lihat di buku besar</span>
                  </Link>
                </div>
              </div>
            ) : (
              <div className="py-10 text-center text-xs text-slate-400">
                Pilih akun dari tabel untuk melihat rincian.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Modal Form Akun (Tambah / Edit) ──────────────────────────────── */}
      {modalOpen && (
        <ModalFormAkun
          account={editingAccount}
          accounts={accounts}
          onClose={() => setModalOpen(false)}
          onSuccess={() => {
            setModalOpen(false);
            loadAccounts();
          }}
        />
      )}
    </div>
  );
}
