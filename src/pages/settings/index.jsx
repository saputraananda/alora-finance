import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useSearchParams } from "react-router-dom";
import ConfirmModal from "../../components/ui/ConfirmModal";
import SaldoAwal from "./components/SaldoAwal";
import {
  HiOutlineCheckCircle,
  HiOutlineCog6Tooth,
  HiOutlineExclamationTriangle,
  HiOutlinePencilSquare,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineXMark,
} from "react-icons/hi2";
import { api } from "../../lib/api";

const cn = (...c) => c.filter(Boolean).join(" ");
const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10";
const rupiah = (n) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(Number(n) || 0);

function AccountSelect({ value, onChange, accounts, types, placeholder = "— pilih akun —" }) {
  const list = types ? accounts.filter((a) => types.includes(a.type)) : accounts;
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} className={inputCls}>
      <option value="">{placeholder}</option>
      {list.map((a) => (
        <option key={a.id} value={a.id}>
          {a.code} {a.name}
        </option>
      ))}
    </select>
  );
}

// Modal standar (StrukturCode §13): portal ke body, header · body scroll · footer
function Modal({ title, subtitle, onClose, children, footer }) {
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-2xl animate-[fadeIn_0.2s_ease-out]" style={{ maxHeight: "92vh" }}>
        <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h3 className="text-sm font-bold tracking-tight text-slate-800">{title}</h3>
            {subtitle && <p className="mt-0.5 text-[11px] text-slate-400">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-50 hover:text-slate-600">
            <HiOutlineXMark className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">{children}</div>
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/50 px-6 py-4">{footer}</div>
      </div>
    </div>,
    document.body
  );
}

const Field = ({ label, hint, children }) => (
  <label className="block space-y-1 text-xs font-semibold text-slate-500">
    {label}
    {children}
    {hint && <span className="block text-[10px] font-normal text-slate-400">{hint}</span>}
  </label>
);

const TABS = [
  { id: "cabang", label: "Cabang & metode bayar" },
  { id: "bank", label: "Rekening bank" },
  { id: "akun", label: "Pemetaan akun" },
  { id: "saldo", label: "Saldo awal" },
];

export default function Pengaturan() {
  const [params] = useSearchParams(); // ?tab=akun dari Integrasi POS
  const [tab, setTab] = useState(["cabang", "bank", "akun", "saldo"].includes(params.get("tab")) ? params.get("tab") : "cabang");
  const [confirm, setConfirm] = useState(null); // rekening yang akan dihapus
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState(null);
  const [modal, setModal] = useState(null); // {kind, form}
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    document.title = "Pengaturan | HO Finance";
  }, []);

  const load = useCallback(async () => {
    try {
      setData(await api("/finance-ho/settings/overview"));
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const call = async (fn, closeModal = true) => {
    setSaving(true);
    setMsg(null);
    try {
      const res = await fn();
      setMsg({ type: "ok", text: res.message });
      if (closeModal) setModal(null);
      await load();
    } catch (e) {
      setMsg({ type: "error", text: e.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-10 text-center text-xs text-slate-400">Memuat pengaturan...</div>;
  if (!data) return <div className="p-6">{msg && <p className="text-xs text-rose-600">{msg.text}</p>}</div>;

  const bankLabel = (id) => {
    const b = data.bank_accounts.find((x) => Number(x.id) === Number(id));
    return b ? `${b.bank_name} ${b.account_no}` : "-";
  };
  const th = "px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-400";

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <div>
        <p className="text-[11px] font-semibold text-slate-400">Pengaturan</p>
        <div className="mt-0.5 flex items-center gap-2">
          <div className="rounded-xl bg-slate-100 p-2 text-slate-700">
            <HiOutlineCog6Tooth className="h-5 w-5" />
          </div>
          <h1 className="text-lg font-extrabold tracking-tight text-slate-800">
            {TABS.find((t) => t.id === tab).label}
          </h1>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Cabang baru cukup didaftarkan di POS, lalu diatur akun dan rekeningnya di sini.{" "}
          Master akun ada di <Link to="/finance-ho/coa" className="font-bold text-emerald-700 hover:underline">Master COA</Link>, anggaran di{" "}
          <Link to="/finance-ho/anggaran-beban" className="font-bold text-emerald-700 hover:underline">Anggaran Beban</Link>.
        </p>
      </div>

      {msg && (
        <div className={cn("flex items-start gap-2 rounded-xl border p-3 text-xs font-medium", msg.type === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700")}>
          {msg.type === "ok" ? <HiOutlineCheckCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <HiOutlineExclamationTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{msg.text}</span>
        </div>
      )}

      <div className="flex gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} className={cn("-mb-px border-b-2 px-4 py-2 text-xs font-bold transition", tab === t.id ? "border-emerald-600 text-emerald-700" : "border-transparent text-slate-400 hover:text-slate-600")}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ───────────── Cabang & metode bayar ───────────── */}
      {tab === "cabang" && (
        <div className="space-y-6">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-100 bg-slate-50">
                  <tr>
                    <th className={th}>Kode</th><th className={th}>Cabang</th><th className={th}>Akun kas</th><th className={th}>Gudang</th><th className={th}>Kepala cabang</th><th className={th}>Mulai pakai alfi</th><th className={th} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.cabang.map((c) => (
                    <tr key={c.outlet_id} className="hover:bg-slate-50/60">
                      <td className="px-3 py-3 font-mono font-bold text-slate-700">{c.code}</td>
                      <td className="px-3 py-3 font-bold text-slate-800">
                        {c.name}
                        {c.is_event && <span className="ml-1.5 rounded bg-violet-50 px-1.5 text-[9px] text-violet-700">Event</span>}
                      </td>
                      <td className="px-3 py-3 text-slate-600">{c.cash_account || <span className="text-slate-400">Bawaan ({data.methods.find((m) => m.code === "TUNAI")?.account || "-"})</span>}</td>
                      <td className="px-3 py-3 text-slate-600">{c.warehouse_code || "-"}</td>
                      <td className="px-3 py-3 text-slate-600">{c.branch_head || "-"}</td>
                      <td className="px-3 py-3 tabular-nums text-slate-600">{c.start_date ? `${c.start_date.slice(8, 10)}/${c.start_date.slice(5, 7)}/${c.start_date.slice(0, 4)}` : <span className="text-slate-400">semua hari</span>}</td>
                      <td className="px-3 py-3 text-right">
                        <button type="button" onClick={() => setModal({ kind: "cabang", form: { ...c } })} className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:border-emerald-400 hover:text-emerald-700">
                          <HiOutlinePencilSquare className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-100 bg-slate-50">
                  <tr>
                    <th className={th}>Metode</th><th className={th}>Akun piutang / kas</th><th className={th}>MDR</th><th className={th}>Cair</th><th className={th}>Rekening tujuan</th><th className={cn(th, "text-right")}>Toleransi</th><th className={th} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.methods.map((m) => (
                    <tr key={m.code} className="hover:bg-slate-50/60">
                      <td className="px-3 py-3 font-bold text-slate-800">{m.label}</td>
                      <td className="px-3 py-3 text-slate-600">{m.account || <span className="text-rose-500">belum dipetakan</span>}</td>
                      <td className="px-3 py-3 text-slate-600">{m.mdr_percent != null ? `${String(m.mdr_percent).replace(".", ",")}%` : m.mdr_fixed != null ? `Rp ${rupiah(m.mdr_fixed)}` : "-"}</td>
                      <td className="px-3 py-3 text-slate-600">{m.settle_days != null ? `T+${m.settle_days}` : m.settle_note || "-"}{m.settle_days != null && m.settle_note ? ` · ${m.settle_note}` : ""}</td>
                      <td className="px-3 py-3 text-slate-600">{m.dest_bank_id ? bankLabel(m.dest_bank_id) : "-"}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-slate-600">{m.tolerance != null ? rupiah(m.tolerance) : "-"}</td>
                      <td className="px-3 py-3 text-right">
                        <button type="button" onClick={() => setModal({ kind: "method", form: { ...m } })} className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:border-emerald-400 hover:text-emerald-700">
                          <HiOutlinePencilSquare className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-slate-100 bg-slate-50/60 px-4 py-2.5 text-[11px] text-slate-500">
              Tarif MDR dan toleransi dikosongkan; isi sesuai kontrak dan kebijakan. MDR dipakai untuk memeriksa potongan di file settlement
              (Rekonsiliasi), toleransi untuk menandai selisih tunai kecil.
            </p>
          </div>
        </div>
      )}

      {/* ───────────── Rekening bank ───────────── */}
      {tab === "bank" && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button type="button" onClick={() => setModal({ kind: "bank", form: { outlet_id: "", bank_name: "", account_no: "", holder: "", account_id: null, is_active: 1 } })} className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700">
              <HiOutlinePlus className="h-4 w-4" /> Rekening baru
            </button>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-100 bg-slate-50">
                  <tr><th className={th}>Cabang</th><th className={th}>Bank</th><th className={th}>No. rekening</th><th className={th}>Atas nama</th><th className={th}>Akun COA</th><th className={th}>Status</th><th className={th} /></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.bank_accounts.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50/60">
                      <td className="px-3 py-3 font-bold text-slate-800">{b.outlet_name}</td>
                      <td className="px-3 py-3">{b.bank_name}</td>
                      <td className="px-3 py-3 font-mono">{b.account_no}</td>
                      <td className="px-3 py-3 text-slate-600">{b.holder}</td>
                      <td className="px-3 py-3 text-slate-600">{b.account_code ? `${b.account_code} ${b.account_name}` : <span className="text-amber-600">pakai akun Bank bawaan</span>}</td>
                      <td className="px-3 py-3">
                        <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold", b.is_active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-400")}>{b.is_active ? "Aktif" : "Nonaktif"}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right">
                        <button type="button" onClick={() => setModal({ kind: "bank", form: { ...b } })} className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:border-emerald-400 hover:text-emerald-700">
                          <HiOutlinePencilSquare className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => setConfirm(b)} className="ml-1.5 rounded-lg border border-slate-200 bg-white p-1.5 text-slate-400 hover:border-rose-300 hover:text-rose-500">
                          <HiOutlineTrash className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-slate-100 bg-slate-50/60 px-4 py-2.5 text-[11px] text-slate-500">
              Awalnya diisi dari daftar rekening yang tertulis di kode my-waschen. Akun COA rekening dipakai sebagai "Bank" di jurnal POS dan rekonsiliasi cabang tersebut.
              Rekening tanpa akun COA memakai akun Bank bawaan.
            </p>
          </div>
        </div>
      )}

      {/* ───────────── Pemetaan akun ───────────── */}
      {tab === "saldo" && <SaldoAwal />}

      {tab === "akun" && (data.service_map || []).length > 0 && (
        <div className="space-y-2">
          {data.service_map.some((s) => !s.account_id) && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <HiOutlineExclamationTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Kategori baru dari POS:{" "}
                <strong>{data.service_map.filter((s) => !s.account_id).map((s) => s.category_name).join(", ")}</strong>. Batch yang memakai
                kategori ini akan gagal validasi. Petakan sekarang.
              </span>
            </div>
          )}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <p className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-extrabold text-slate-700">Layanan → akun pendapatan</p>
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100">
                <tr><th className={th}>Kategori layanan POS</th><th className={cn(th, "text-right")}>Layanan</th><th className={cn(th, "w-[380px]")}>Akun pendapatan</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.service_map.map((s) => (
                  <tr key={s.category_id} className={cn(!s.account_id && "bg-amber-50/40")}>
                    <td className="px-3 py-2.5">
                      <span className="font-bold text-slate-800">{s.category_name}</span>
                      {!s.account_id && <span className="ml-1.5 rounded bg-amber-100 px-1.5 text-[9px] font-bold text-amber-700">Belum dipetakan</span>}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{s.services}</td>
                    <td className="px-3 py-2">
                      <AccountSelect
                        value={s.account_id}
                        accounts={data.accounts}
                        types={["PENDAPATAN"]}
                        placeholder="— belum dipetakan —"
                        onChange={(id) => id && call(() => api(`/finance-ho/settings/service-map/${s.category_id}`, { method: "PUT", body: JSON.stringify({ account_id: id }) }), false)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-slate-100 bg-slate-50/60 px-4 py-2.5 text-[11px] text-slate-500">
              Biaya kecepatan (ekspres) dan diskon diatur lewat peran "Pendapatan Ekspres" dan "Diskon Penjualan" di bawah. Outlet Event selalu memakai akun Pendapatan B2B.
            </p>
          </div>
        </div>
      )}

      {tab === "akun" && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <p className="border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-xs font-extrabold text-slate-700">Peran akun (kas, piutang, metode bayar, selisih)</p>
          <table className="w-full text-left text-xs">
            <thead className="border-b border-slate-100 bg-slate-50">
              <tr><th className={th}>Peran akun</th><th className={cn(th, "w-[380px]")}>Akun COA yang dipakai</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.account_map.map((r) => (
                <tr key={r.role}>
                  <td className="px-3 py-3">
                    <p className="font-bold text-slate-800">{r.label}</p>
                    <p className="font-mono text-[10px] text-slate-400">{r.role}</p>
                  </td>
                  <td className="px-3 py-2">
                    <AccountSelect
                      value={r.account_id}
                      accounts={data.accounts}
                      onChange={(id) => id && call(() => api(`/finance-ho/settings/account-map/${r.role}`, { method: "PUT", body: JSON.stringify({ account_id: id }) }), false)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="border-t border-slate-100 bg-slate-50/60 px-4 py-2.5 text-[11px] text-slate-500">
            Perubahan berlaku untuk posting berikutnya. Jurnal yang sudah diposting tidak berubah.
          </p>
        </div>
      )}

      <ConfirmModal
        open={Boolean(confirm)}
        onClose={() => setConfirm(null)}
        title="Hapus rekening bank?"
        desc={confirm ? `${confirm.bank_name} ${confirm.account_no} a/n ${confirm.holder} akan dihapus. Metode bayar yang memakai rekening ini akan dikosongkan.` : ""}
        loading={saving}
        onConfirm={async () => {
          const b = confirm;
          await call(() => api(`/finance-ho/settings/bank-accounts/${b.id}`, { method: "DELETE" }), false);
          setConfirm(null);
        }}
      />

      {/* ───────────── Modal ───────────── */}
      {modal?.kind === "cabang" && (
        <Modal
          title={`Cabang ${modal.form.name}`}
          subtitle={`Kode POS: ${modal.form.code}`}
          onClose={() => setModal(null)}
          footer={
            <>
              <button type="button" onClick={() => setModal(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Batal</button>
              <button type="button" disabled={saving} onClick={() => call(() => api(`/finance-ho/settings/cabang/${modal.form.outlet_id}`, { method: "PUT", body: JSON.stringify(modal.form) }))} className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">{saving ? "Menyimpan..." : "Simpan"}</button>
            </>
          }
        >
          <Field label="Akun kas cabang" hint="Kosongkan untuk memakai akun Kas bawaan. Akun yang dipilih tidak bisa dipakai di jurnal manual.">
            <AccountSelect value={modal.form.cash_account_id} accounts={data.accounts} types={["ASET"]} placeholder="— pakai akun bawaan —" onChange={(id) => setModal({ ...modal, form: { ...modal.form, cash_account_id: id } })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kode gudang"><input className={inputCls} value={modal.form.warehouse_code} onChange={(e) => setModal({ ...modal, form: { ...modal.form, warehouse_code: e.target.value } })} placeholder="GD-A" /></Field>
            <Field label="Kepala cabang"><input className={inputCls} value={modal.form.branch_head} onChange={(e) => setModal({ ...modal, form: { ...modal.form, branch_head: e.target.value } })} /></Field>
          </div>
          <div>
            <Field label="Mulai pakai alfi (go-live)" hint="Hari sebelum tanggal ini tidak diposting, tidak direkonsiliasi, dan tidak muncul di Perlu tindakan. Kosongkan = semua hari."><input type="date" className={inputCls} value={modal.form.start_date || ""} onChange={(e) => setModal({ ...modal, form: { ...modal.form, start_date: e.target.value } })} /></Field>
          </div>
        </Modal>
      )}

      {modal?.kind === "method" && (
        <Modal
          title={modal.form.label}
          subtitle="Kosongkan bila belum ada kontrak / kebijakan."
          onClose={() => setModal(null)}
          footer={
            <>
              <button type="button" onClick={() => setModal(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Batal</button>
              <button type="button" disabled={saving} onClick={() => call(() => api(`/finance-ho/settings/method/${modal.form.code}`, { method: "PUT", body: JSON.stringify(modal.form) }))} className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50">{saving ? "Menyimpan..." : "Simpan"}</button>
            </>
          }
        >
          {(modal.form.code === "QRIS" || modal.form.code === "EDC") && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="MDR (%)" hint="Dipakai memeriksa potongan di file settlement"><input type="number" step="0.001" min="0" max="100" className={inputCls} value={modal.form.mdr_percent ?? ""} onChange={(e) => setModal({ ...modal, form: { ...modal.form, mdr_percent: e.target.value } })} placeholder="mis. 0,7" /></Field>
              <Field label="MDR nominal tetap (Rp)" hint="Alternatif bila kontrak berupa nominal"><input type="number" min="0" className={inputCls} value={modal.form.mdr_fixed ?? ""} onChange={(e) => setModal({ ...modal, form: { ...modal.form, mdr_fixed: e.target.value } })} /></Field>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Cair (T+ hari)"><input type="number" min="0" max="30" className={inputCls} value={modal.form.settle_days ?? ""} onChange={(e) => setModal({ ...modal, form: { ...modal.form, settle_days: e.target.value } })} placeholder="mis. 1" /></Field>
            <Field label="Catatan cair"><input className={inputCls} value={modal.form.settle_note || ""} onChange={(e) => setModal({ ...modal, form: { ...modal.form, settle_note: e.target.value } })} placeholder="mis. Setor H+1" /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Rekening tujuan">
              <select className={inputCls} value={modal.form.dest_bank_id ?? ""} onChange={(e) => setModal({ ...modal, form: { ...modal.form, dest_bank_id: e.target.value ? Number(e.target.value) : null } })}>
                <option value="">— belum diatur —</option>
                {data.bank_accounts.map((b) => <option key={b.id} value={b.id}>{b.outlet_name} · {b.bank_name} {b.account_no}</option>)}
              </select>
            </Field>
            <Field label="Toleransi selisih (Rp)" hint="Selisih sampai nilai ini ditandai 'dalam toleransi'"><input type="number" min="0" className={inputCls} value={modal.form.tolerance ?? ""} onChange={(e) => setModal({ ...modal, form: { ...modal.form, tolerance: e.target.value } })} /></Field>
          </div>
        </Modal>
      )}

      {modal?.kind === "bank" && (
        <Modal
          title={modal.form.id ? "Ubah rekening bank" : "Rekening bank baru"}
          onClose={() => setModal(null)}
          footer={
            <>
              <button type="button" onClick={() => setModal(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">Batal</button>
              <button
                type="button"
                disabled={saving}
                onClick={() => call(() => api(modal.form.id ? `/finance-ho/settings/bank-accounts/${modal.form.id}` : "/finance-ho/settings/bank-accounts", { method: modal.form.id ? "PUT" : "POST", body: JSON.stringify(modal.form) }))}
                className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? "Menyimpan..." : "Simpan"}
              </button>
            </>
          }
        >
          <Field label="Cabang">
            <select className={inputCls} value={modal.form.outlet_id ?? ""} onChange={(e) => setModal({ ...modal, form: { ...modal.form, outlet_id: e.target.value ? Number(e.target.value) : "" } })}>
              <option value="">Pusat (tanpa cabang)</option>
              {data.cabang.map((c) => <option key={c.outlet_id} value={c.outlet_id}>{c.name}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bank"><input className={inputCls} value={modal.form.bank_name} onChange={(e) => setModal({ ...modal, form: { ...modal.form, bank_name: e.target.value } })} placeholder="BCA" /></Field>
            <Field label="No. rekening"><input className={inputCls} value={modal.form.account_no} onChange={(e) => setModal({ ...modal, form: { ...modal.form, account_no: e.target.value } })} /></Field>
          </div>
          <Field label="Atas nama"><input className={inputCls} value={modal.form.holder} onChange={(e) => setModal({ ...modal, form: { ...modal.form, holder: e.target.value } })} /></Field>
          <Field label="Akun COA" hint="Dipakai sebagai 'Bank' di jurnal cabang ini"><AccountSelect value={modal.form.account_id} accounts={data.accounts} types={["ASET"]} placeholder="— pakai akun Bank bawaan —" onChange={(id) => setModal({ ...modal, form: { ...modal.form, account_id: id } })} /></Field>
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <input type="checkbox" checked={Boolean(modal.form.is_active)} onChange={(e) => setModal({ ...modal, form: { ...modal.form, is_active: e.target.checked ? 1 : 0 } })} /> Aktif
          </label>
        </Modal>
      )}
    </div>
  );
}
