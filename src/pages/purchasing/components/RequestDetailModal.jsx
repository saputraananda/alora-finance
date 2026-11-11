import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import ConfirmModal from "../../../components/ui/ConfirmModal";
import PayModal from "./PayModal";
import { HiOutlineArrowUpTray, HiOutlineXMark } from "react-icons/hi2";
import { api, getToken } from "../../../lib/api";
import { TYPE_LABEL, getStatusDisplay, assetUrl, cn, dmy, dmyTime, rp } from "../utils/format";

function Field({ label, children }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
      <div className="mt-0.5 text-xs font-medium text-slate-700">{children || "-"}</div>
    </div>
  );
}

export default function RequestDetailModal({ id, onClose, onChanged }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [paying, setPaying] = useState(false);
  const [newFiles, setNewFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [fileKey, setFileKey] = useState(0);
  const [notice, setNotice] = useState("");

  const uploadFiles = async () => {
    if (!newFiles.length) return;
    setUploading(true);
    setActionError("");
    try {
      const fd = new FormData();
      newFiles.forEach((f) => fd.append("attachments", f));
      const base = (import.meta.env.VITE_API_URL || "").replace(/[/]+$/, "");
      const res = await fetch(`${base}/api/finance-ho/purchasing/requests/${id}/attachments`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || "Gagal mengunggah lampiran");
      setNotice(json.message || "Lampiran ditambahkan.");
      setNewFiles([]);
      setFileKey((k) => k + 1);
      await reload();
    } catch (e) {
      setActionError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const reload = () => api(`/finance-ho/purchasing/requests/${id}`).then(setD).catch(() => {});

  const journalNow = async () => {
    setBusy(true);
    setActionError("");
    try {
      const r = await api(`/finance-ho/purchasing/requests/${id}/journal`, { method: "POST", body: JSON.stringify({}) });
      setNotice(r.message || "Jurnal dibuat.");
      await reload();
      onChanged?.();
    } catch (e) {
      setActionError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const act = async (path, body) => {
    setBusy(true);
    setActionError("");
    try {
      await api(`/finance-ho/purchasing/requests/${id}/${path}`, { method: "POST", body: JSON.stringify(body || {}) });
      onChanged?.();
      onClose();
    } catch (e) {
      setActionError(e.message);
      setConfirmApprove(false);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let alive = true;
    api(`/finance-ho/purchasing/requests/${id}`)
      .then((r) => alive && setD(r))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [id]);

  const pr = d?.data;
  // Menunggu keputusan Finance: pengajuan biasa status 4, reimburse status 2 (sama dengan SuperApp)
  const canDecide = !!pr && Number(pr.status) === (pr.type === "reimburse" ? 2 : 4);
  const canPay = !!pr && Number(pr.status) === 5;
  const paidNoJournal = !!pr && [6, 7].includes(Number(pr.status)) && (d?.journals || []).length === 0;
  const st = pr ? getStatusDisplay({ ...pr, total_paid: d?.total_paid }) : null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-100 p-5">
          <div>
            <h3 className="text-base font-bold text-slate-800">{pr ? `${pr.pr_code} · ${pr.nama_barang}` : "Detail pengajuan"}</h3>
            {pr && (
              <p className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-bold", st.cls)}>{st.label}</span>
                {TYPE_LABEL[pr.type] || pr.type} · diajukan {dmy(pr.tanggal_pengajuan)}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Tutup">
            <HiOutlineXMark className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 overflow-auto p-5">
          {error && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{error}</p>}
          {!d && !error && <p className="py-10 text-center text-xs text-slate-400">Memuat...</p>}
          {d && !(canDecide || canPay || paidNoJournal) && notice && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">{notice}</p>}
          {d && !(canDecide || canPay || paidNoJournal) && actionError && <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{actionError}</p>}

          {pr && (
            <>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <Field label="Pengaju">{pr.pengaju_name}</Field>
                <Field label="Departemen">{pr.department_name}</Field>
                <Field label="Outlet">{pr.outlet_name}</Field>
                <Field label="Jumlah">{pr.qty ? `${Number(pr.qty)} ${pr.satuan_name || ""}` : "-"}</Field>
                <Field label="Nominal">Rp {rp(pr.amount)}</Field>
                <Field label="Metode bayar">{pr.payment_method === "kredit" ? "Kredit" : pr.payment_method === "cash" ? "Tunai" : "-"}</Field>
                <Field label="Vendor">{pr.vendor}</Field>
                <Field label="Rekening tujuan">{pr.bank_name ? `${pr.bank_name} ${pr.nomor_rekening || ""} a.n. ${pr.atas_nama || "-"}` : null}</Field>
                <Field label="Jatuh tempo">{pr.jatuh_tempo ? dmy(pr.jatuh_tempo) : null}</Field>
              </div>

              {(pr.alasan_pembelian || pr.deskripsi) && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Alasan pembelian">{pr.alasan_pembelian}</Field>
                  <Field label="Deskripsi">{pr.deskripsi}</Field>
                </div>
              )}

              {pr.rejection_reason && (
                <p className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">Alasan ditolak: {pr.rejection_reason}</p>
              )}

              {d.classifications.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Klasifikasi</p>
                  <div className="flex flex-wrap gap-1.5">
                    {d.classifications.map((c) => (
                      <span key={c.id} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                        {c.classification_name}{Number(c.nominal) ? ` · Rp ${rp(c.nominal)}` : ""}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {d.allocations.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Alokasi per outlet</p>
                  <table className="w-full text-left text-xs">
                    <tbody className="divide-y divide-slate-100">
                      {d.allocations.map((a, i) => (
                        <tr key={i}>
                          <td className="py-1.5 pr-3 text-slate-600">{a.classification_name}</td>
                          <td className="py-1.5 pr-3 text-slate-500">{a.outlet_name || "Semua outlet"}</td>
                          <td className="py-1.5 text-right font-semibold tabular-nums">Rp {rp(a.nominal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {(d.journals || []).length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Jurnal di alfi</p>
                  <ul className="space-y-1 text-xs">
                    {d.journals.map((j, i) => (
                      <li key={i} className="text-slate-600"><span className="font-semibold text-emerald-700">{j.entry_no}</span> · Rp {rp(j.amount)}</li>
                    ))}
                  </ul>
                </div>
              )}

              {d.payments.length > 0 && (
                <div>
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Riwayat pembayaran · total Rp {rp(d.total_paid)}</p>
                  <table className="w-full text-left text-xs">
                    <tbody className="divide-y divide-slate-100">
                      {d.payments.map((p, i) => (
                        <tr key={i}>
                          <td className="py-1.5 pr-3 tabular-nums text-slate-500">{dmyTime(p.paid_at)}</td>
                          <td className="py-1.5 pr-3 text-slate-600">{p.paid_by_name || "-"}</td>
                          <td className="py-1.5 pr-3 text-slate-500">{p.note || ""}</td>
                          <td className="py-1.5 text-right font-semibold tabular-nums">Rp {rp(p.nominal_bayar)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Lampiran ({d.attachments.length})</p>
                {d.attachments.length === 0 ? (
                  <p className="text-xs text-slate-400">Belum ada lampiran.</p>
                ) : (
                  <ul className="space-y-1 text-xs">
                    {d.attachments.map((a) => {
                      const url = assetUrl(a.file_path);
                      const name = a.original_name || a.file_path;
                      return (
                        <li key={a.attachment_id} className="truncate text-slate-600">
                          {url ? <a href={url} target="_blank" rel="noreferrer" className="font-semibold text-emerald-700 hover:underline">{name}</a> : name}
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-slate-200 p-3">
                  <input
                    key={fileKey}
                    type="file"
                    multiple
                    accept=".jpg,.jpeg,.png,.webp,.pdf"
                    onChange={(e) => setNewFiles(Array.from(e.target.files || []).slice(0, 10))}
                    className="min-w-0 flex-1 text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-emerald-700"
                  />
                  <button
                    type="button"
                    disabled={!newFiles.length || uploading}
                    onClick={uploadFiles}
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
                  >
                    <HiOutlineArrowUpTray className="h-4 w-4" /> {uploading ? "Mengunggah..." : "Unggah lampiran"}
                  </button>
                  <p className="w-full text-[10px] text-slate-400">JPG, PNG, WEBP, atau PDF · maks 10 file × 10 MB</p>
                </div>
              </div>

              <div>
                <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Riwayat proses</p>
                <ol className="space-y-1.5 border-l-2 border-slate-100 pl-3 text-xs">
                  {d.logs.map((l, i) => (
                    <li key={i}>
                      <span className="font-semibold text-slate-700">{l.action}</span>
                      <span className="text-slate-500"> · {l.by_name || "-"} · {dmyTime(l.logged_at)}</span>
                      {l.note && <p className="text-slate-500">{l.note}</p>}
                    </li>
                  ))}
                </ol>
              </div>
            </>
          )}
        </div>

        {(canDecide || canPay || paidNoJournal || notice) && (
          <div className="border-t border-slate-100 bg-slate-50 p-4">
            {notice && <p className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700">{notice}</p>}
            {actionError && <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{actionError}</p>}
            {rejecting ? (
              <div className="space-y-2">
                <label className="text-[11px] font-bold text-slate-500">Alasan penolakan (wajib)</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 bg-white p-2.5 text-xs outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-500/10"
                  placeholder="Tuliskan alasan agar pengaju tahu"
                />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => { setRejecting(false); setReason(""); }} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-500">Batal</button>
                  <button type="button" disabled={busy || !reason.trim()} onClick={() => act(canPay ? "reject-payment" : "reject", { reason })} className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">
                    {busy ? "Memproses..." : "Tolak pengajuan"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] text-slate-500">{canPay ? "Siap dibayar." : paidNoJournal ? "Sudah dibayar, belum ada jurnal." : canDecide ? "Menunggu keputusan Finance." : ""}</p>
                <div className="flex gap-2">
                  {(canDecide || canPay) && (
                    <button type="button" onClick={() => setRejecting(true)} className="rounded-xl border border-rose-200 bg-white px-4 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50">Tolak</button>
                  )}
                  {canDecide && (
                    <button type="button" onClick={() => setConfirmApprove(true)} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700">Setujui</button>
                  )}
                  {canPay && (
                    <button type="button" onClick={() => setPaying(true)} className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700">Bayar</button>
                  )}
                  {paidNoJournal && (
                    <button type="button" disabled={busy} onClick={journalNow} className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60">{busy ? "Memproses..." : "Buat jurnal"}</button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {paying && pr && (
        <PayModal
          pr={pr}
          scope={d.scope || []}
          onClose={() => setPaying(false)}
          onDone={(res) => {
            setPaying(false);
            const j = res.journal;
            const ok = j && ["DIJURNAL", "SUDAH", "DILEWATI"].includes(j.status);
            setNotice(`${res.message}${j ? ` Jurnal: ${j.message}` : ""}`);
            if (!ok && j) setActionError("");
            reload();
            onChanged?.();
          }}
        />
      )}

      <ConfirmModal
        open={confirmApprove}
        onClose={() => setConfirmApprove(false)}
        onConfirm={() => act("approve")}
        loading={busy}
        tone="warning"
        title="Setujui pengajuan ini?"
        desc={`${pr?.pr_code || ""} akan masuk ke daftar menunggu pembayaran dan statusnya berubah di SuperApp juga.`}
        confirmLabel="Ya, setujui"
      />
    </div>,
    document.body
  );
}
