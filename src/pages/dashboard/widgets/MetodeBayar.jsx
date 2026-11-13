import { useDashData } from "../data";
import { Card, State, jt, rangeLabel, rupiah } from "../ui";

const COLORS = { Tunai: "#2563eb", QRIS: "#60a5fa", EDC: "#bfdbfe", "Transfer Bank": "#f59e0b", Deposit: "#fcd34d", Lainnya: "#cbd5e1" };

// Pembayaran POS yang diterima per metode bayar: batang proporsi + tabel nominal ke bawah.
export default function MetodeBayar({ unit }) {
  const entry = useDashData("methods");
  const d = entry.data;

  return (
    <Card title="Penjualan per Metode Bayar" subtitle={d ? `${rangeLabel(d.from, d.to)} · pembayaran POS diterima` : undefined} note={unit !== "all" ? "Alokasi per nota" : undefined}>
      <State entry={entry} empty={d && d.total <= 0 ? "Belum ada pembayaran pada rentang ini." : null}>
        {d && (
          <>
            <div className="mb-3 flex h-3 overflow-hidden rounded-full bg-slate-100">
              {d.items.filter((i) => i.amount > 0).map((i) => (
                <div key={i.method} title={`${i.method}: Rp ${rupiah(i.amount)}`} style={{ width: `${(i.amount / d.total) * 100}%`, background: COLORS[i.method] }} />
              ))}
            </div>
            <table className="w-full text-xs">
              <tbody className="divide-y divide-slate-100">
                {d.items.map((i) => (
                  <tr key={i.method}>
                    <td className="py-1.5">
                      <span className="flex items-center gap-2 text-slate-600">
                        <span className="h-2 w-2 rounded-full" style={{ background: COLORS[i.method] }} />
                        {i.method}
                      </span>
                    </td>
                    <td className="py-1.5 text-right font-semibold tabular-nums text-slate-700">{jt(i.amount)}</td>
                    <td className="w-12 py-1.5 text-right text-[10px] tabular-nums text-slate-400">{d.total > 0 ? Math.round((i.amount / d.total) * 100) : 0}%</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2 font-bold text-slate-800">Total</td>
                  <td className="py-2 text-right font-extrabold tabular-nums text-slate-800">{jt(d.total)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </>
        )}
      </State>
    </Card>
  );
}
