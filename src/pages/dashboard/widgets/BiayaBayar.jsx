import { Link } from "react-router-dom";
import { useDashData } from "../data";
import { Card, State, Stat, jt, rangeLabel, rupiah } from "../ui";

// Ringkasan menu Pembelian (Pengajuan, Pembayaran, Kredit) — istilah sama dengan menu aslinya.
export default function BiayaBayar() {
  const entry = useDashData("purchasing");
  const d = entry.data;
  const link = "text-[11px] font-bold text-emerald-700 hover:underline";

  return (
    <Card title="Biaya & Pembayaran" subtitle="Dari Pengajuan karyawan (SuperApp)">
      <State entry={entry}>
        {d && (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              <Stat label="Antrean Finance" value={jt(d.antrean.amount)} hint={`${rupiah(d.antrean.count)} pengajuan`} tone={d.antrean.count ? "text-amber-600" : undefined} />
              <Stat label="Menunggu bayar" value={jt(d.bayar.amount)} hint={`${rupiah(d.bayar.count)} pengajuan`} />
              <Stat label="Hutang belum jatuh tempo" value={jt(d.hutang_belum.amount)} hint={`${rupiah(d.hutang_belum.count)} kredit`} />
              <Stat label="Hutang lewat jatuh tempo" value={jt(d.hutang_lewat.amount)} hint={`${rupiah(d.hutang_lewat.count)} kredit`} tone={d.hutang_lewat.count ? "text-rose-600" : undefined} />
            </div>
            <p className="mt-3 flex justify-between border-t border-slate-100 pt-2.5 text-[11px] text-slate-500">
              <span>Sudah dibayar · {rangeLabel(d.from, d.to)}</span>
              <span className="font-extrabold tabular-nums text-slate-800">Rp {rupiah(d.paid_in_range)}</span>
            </p>
            <div className="mt-2 flex gap-4">
              <Link to="/finance-ho/pembelian/pengajuan" className={link}>Pengajuan</Link>
              <Link to="/finance-ho/pembelian/pembayaran" className={link}>Pembayaran</Link>
              <Link to="/finance-ho/pembelian/kredit" className={link}>Kredit</Link>
            </div>
          </>
        )}
      </State>
    </Card>
  );
}
