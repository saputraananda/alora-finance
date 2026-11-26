import { useEffect, useMemo, useRef, useState } from "react";
import { HiOutlineChevronDown } from "react-icons/hi2";
import { cn } from "../utils/format";

// Dropdown akun yang bisa dicari. Akun induk (header) tampil sebagai judul grup dan tidak bisa dipilih;
// akun induk biasa (bukan header) yang punya anak tetap bisa dipilih, anaknya menjorok di bawahnya.
export function buildAccountRows(accounts = []) {
  const kids = new Map();
  for (const a of accounts) {
    const k = a.parent_id ? Number(a.parent_id) : 0;
    if (!kids.has(k)) kids.set(k, []);
    kids.get(k).push(a);
  }
  const byCode = (x, y) => String(x.code).localeCompare(String(y.code), undefined, { numeric: true });
  const rows = [];
  const tops = (kids.get(0) || []).slice().sort(byCode);
  for (const t of tops) {
    const sub = (kids.get(Number(t.id)) || []).slice().sort(byCode);
    if (Number(t.is_header)) {
      if (!sub.length) continue;
      rows.push({ ...t, kind: "header", depth: 0 });
    } else {
      rows.push({ ...t, kind: "item", depth: 0 });
    }
    for (const c of sub) rows.push({ ...c, kind: "item", depth: 1 });
  }
  // anak yang induknya tidak ada di daftar (mis. nonaktif) tetap ditampilkan
  const shown = new Set(rows.map((r) => Number(r.id)));
  for (const a of accounts) if (!shown.has(Number(a.id)) && !Number(a.is_header)) rows.push({ ...a, kind: "item", depth: 0 });
  return rows;
}

export default function AccountSelect({ accounts, value, onChange, placeholder = "Pilih akun…", ariaLabel, invalid }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const rows = useMemo(() => buildAccountRows(accounts), [accounts]);
  const selected = accounts.find((a) => String(a.id) === String(value));
  const needle = q.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!needle) return rows;
    const hit = (r) => `${r.code} ${r.name}`.toLowerCase().includes(needle);
    // tampilkan header hanya bila ada anak yang cocok
    const out = [];
    rows.forEach((r, i) => {
      if (r.kind === "header") {
        let any = false;
        for (let j = i + 1; j < rows.length && rows[j].depth > 0; j += 1) if (hit(rows[j])) { any = true; break; }
        if (any) out.push(r);
      } else if (hit(r)) out.push(r);
    });
    return out;
  }, [rows, needle]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg border bg-white px-2.5 py-1.5 text-left text-xs outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10",
          invalid ? "border-rose-300" : "border-slate-200"
        )}
      >
        <span className={cn("truncate", !selected && "text-slate-400")}>{selected ? `${selected.code} · ${selected.name}` : placeholder}</span>
        <HiOutlineChevronDown className={cn("h-4 w-4 shrink-0 text-slate-400 transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 p-2">
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari kode atau nama akun…" className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-emerald-500" />
          </div>
          <div role="listbox" className="max-h-60 overflow-auto p-1">
            {!visible.length && <p className="px-3 py-2 text-xs text-slate-400">Akun tidak ditemukan.</p>}
            {visible.map((r) =>
              r.kind === "header" ? (
                <p key={r.id} className="mt-1 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">{r.code} · {r.name}</p>
              ) : (
                <button
                  key={r.id}
                  type="button"
                  role="option"
                  aria-selected={String(r.id) === String(value)}
                  onClick={() => { onChange(String(r.id)); setOpen(false); setQ(""); }}
                  className={cn(
                    "block w-full truncate rounded-lg py-1.5 pr-2.5 text-left text-xs hover:bg-emerald-50",
                    r.depth ? "pl-6" : "pl-2.5",
                    String(r.id) === String(value) ? "bg-emerald-50 font-bold text-emerald-700" : "text-slate-700",
                    r.depth === 0 && accounts.some((x) => Number(x.parent_id) === Number(r.id)) && "font-semibold"
                  )}
                >
                  <span className="tabular-nums text-slate-400">{r.code}</span> · {r.name}
                </button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
