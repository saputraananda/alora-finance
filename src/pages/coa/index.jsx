import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  HiOutlinePlus,
  HiOutlineXMark,
  HiOutlineSparkles,
  HiOutlineNumberedList,
} from "react-icons/hi2";
import { api } from "../../lib/api";
import PageHeader, { SearchBox, PrimaryButton } from "../../components/ui/PageHeader";
import ModalFormAkun from "../../components/ModalFormAkun";
import { CF_LABEL } from "../../lib/cashFlow";

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
      <PageHeader
        crumb="Master Data"
        icon={HiOutlineNumberedList}
        title="Daftar Akun (COA)"
        subtitle="Chart of Account · data contoh"
        search={<SearchBox value={search} onChange={setSearch} placeholder="Cari kode atau nama akun" />}
      >
        {accounts.length === 0 && (
          <button
            type="button"
            onClick={handleSeedDefault}
            disabled={seeding || loading}
            className="flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 hover:border-emerald-400 hover:text-emerald-700 disabled:opacity-40"
          >
            <HiOutlineSparkles className="h-4 w-4" /> {seeding ? "Memuat..." : "Muat Akun Standar"}
          </button>
        )}
        <PrimaryButton
          onClick={() => {
            setEditingAccount(null);
            setModalOpen(true);
          }}
          icon={HiOutlinePlus}
        >
          Akun baru
        </PrimaryButton>
      </PageHeader>


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

                {selectedAccount.cash_flow && (
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-slate-500">Arus kas</span>
                    <span className="text-right text-slate-800">
                      {CF_LABEL[selectedAccount.cash_flow.group]}
                      <span className="block text-[10px] text-slate-400">
                        {selectedAccount.cash_flow_group ? "dipilih manual" : `otomatis: ${selectedAccount.cash_flow.reason}`}
                      </span>
                    </span>
                  </div>
                )}

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
                    to={`/finance-ho/general-ledger?tab=ledger&account_id=${selectedAccount.id}`}
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
