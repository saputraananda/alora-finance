import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useDashData } from "../data";
import { Card, State, ddmm, juta, rangeLabel, rupiah } from "../ui";

// Uang masuk & keluar rekening bank per hari (7 hari terakhir), dari jurnal akun bank.
export default function ArusKas() {
  const entry = useDashData("cashflow");
  const d = entry.data;
  const rows = d?.days?.map((x) => ({ label: ddmm(x.date), masuk: x.masuk, keluar: x.keluar })) || [];

  return (
    <Card title="Arus Kas" subtitle={d?.mapped ? `7 hari terakhir · ${rangeLabel(d.from, d.to)} · juta Rp` : "7 hari terakhir"} note={d?.incomplete_today ? "hari ini belum lengkap" : undefined}>
      <State
        entry={entry}
        empty={
          d && !d.mapped ? (
            <span>
              Akun bank belum dipetakan.
              <Link to="/finance-ho/pengaturan" className="mt-1 block font-bold text-emerald-700 hover:underline">Buka Pengaturan</Link>
            </span>
          ) : null
        }
      >
        {d?.mapped && (
          <>
            <div className="mb-1 flex items-center gap-4 text-[11px] text-slate-500">
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />Masuk bank</span>
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />Keluar</span>
            </div>
            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows} margin={{ top: 6, right: 4, left: -14, bottom: 0 }} barGap={2}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} />
                  <YAxis tickFormatter={juta} tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={44} />
                  <Tooltip formatter={(v, name) => [`Rp ${rupiah(v)}`, name]} contentStyle={{ fontSize: 12, borderRadius: 12 }} cursor={{ fill: "#f8fafc" }} />
                  <Bar dataKey="masuk" name="Masuk bank" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={18} />
                  <Bar dataKey="keluar" name="Keluar" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={18} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 flex justify-between border-t border-slate-100 pt-2.5 text-[11px] text-slate-500">
              <span>Saldo bank operasional</span>
              <span className="font-extrabold tabular-nums text-slate-800">Rp {rupiah(d.balance)}</span>
            </p>
          </>
        )}
      </State>
    </Card>
  );
}
