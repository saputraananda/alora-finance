import { useEffect, useState } from "react";
import { HiOutlineLockClosed } from "react-icons/hi2";
import { api } from "../../../lib/api";

// Menu Pembelian hanya untuk tim Finance. Penegakan sebenarnya ada di backend;
// komponen ini hanya menampilkan pesan yang jelas bila akses ditolak.
export default function FinanceOnly({ children }) {
  const [state, setState] = useState("loading"); // loading | ok | denied | error
  const [message, setMessage] = useState("");

  useEffect(() => {
    let alive = true;
    api("/finance-ho/purchasing/me")
      .then((me) => alive && setState(me.is_finance ? "ok" : "denied"))
      .catch((e) => {
        if (!alive) return;
        setMessage(e.message);
        setState("error");
      });
    return () => {
      alive = false;
    };
  }, []);

  if (state === "ok") return children;
  if (state === "loading") return <p className="p-10 text-center text-xs text-slate-400">Memeriksa akses...</p>;
  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
        <HiOutlineLockClosed className="h-6 w-6" />
      </div>
      <h2 className="text-sm font-bold text-slate-800">Akses ditolak</h2>
      <p className="mt-1 text-xs text-slate-500">
        {state === "denied" ? "Menu Pembelian hanya untuk tim Finance." : message || "Gagal memeriksa hak akses."}
      </p>
    </div>
  );
}
