import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useDashData } from "../data";
import { Card, State, ddmm, jt, juta, rangeLabel, rupiah } from "../ui";

const UNITS = [
  { key: "waschen", label: "Waschen", color: "#2563eb" },
  { key: "cleanox", label: "Cleanox", color: "#f59e0b" },
];

// Titik terakhir berupa lingkaran kosong (hari berjalan belum lengkap), titik lain tanpa penanda
const lastDot = (color, lastIndex) => (p) =>
  p.index === lastIndex ? <circle key={p.key} cx={p.cx} cy={p.cy} r={4.5} fill="#fff" stroke={color} strokeWidth={2} /> : <g key={p.key} />;

// Tren pendapatan harian dari POS: satu grafik, garis Waschen dan Cleanox bersama.
// Filter unit menentukan garis yang tampil.
export default function TrenPendapatan({ unit }) {
  const entry = useDashData("sales");
  const d = entry.data;
  const shown = UNITS.filter((u) => unit === "all" || u.key === unit);
  const rows = d ? d.days.map((x) => ({ label: ddmm(x.date), waschen: x.waschen, cleanox: x.cleanox })) : [];
  const last = rows.length - 1;

  return (
    <Card title="Tren Pendapatan" subtitle={d ? rangeLabel(d.from, d.to) : undefined}>
      <State entry={entry} empty={d && d.days.length === 0 ? "Belum ada transaksi pada rentang ini." : null}>
        {d && (
          <>
            <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
              <div className="flex items-center gap-4">
                {shown.map((u) => (
                  <span key={u.key} className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: u.color }} />
                    {u.label}
                  </span>
                ))}
              </div>
              <span className="text-slate-400">juta Rp{d.incomplete_today ? " · hari ini belum lengkap" : ""}</span>
            </div>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={rows} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                  <defs>
                    <linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.14} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={{ stroke: "#e2e8f0" }} minTickGap={16} />
                  <YAxis tickFormatter={juta} tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} width={44} />
                  <Tooltip formatter={(v, name) => [`Rp ${rupiah(v)}`, name]} labelStyle={{ fontSize: 11 }} contentStyle={{ fontSize: 12, borderRadius: 12 }} />
                  {shown.some((u) => u.key === "waschen") && <Area type="monotone" dataKey="waschen" name="Waschen" stroke="none" fill="url(#trend-fill)" legendType="none" activeDot={false} isAnimationActive={false} />}
                  {shown.map((u) => (
                    <Line key={u.key} type="monotone" dataKey={u.key} name={u.label} stroke={u.color} strokeWidth={2.5} dot={lastDot(u.color, last)} activeDot={{ r: 4 }} isAnimationActive={false} />
                  ))}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            {d.yesterday && (
              <p className="mt-3 flex flex-wrap justify-between gap-x-4 border-t border-slate-100 pt-2.5 text-[11px] text-slate-500">
                <span>Kemarin</span>
                <span className="font-semibold text-slate-700">{shown.map((u) => `${u.label} ${jt(d.yesterday[u.key])}`).join(" · ")}</span>
              </p>
            )}
          </>
        )}
      </State>
    </Card>
  );
}
