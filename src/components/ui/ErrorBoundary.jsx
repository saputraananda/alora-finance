import { Component } from "react";
import { HiOutlineExclamationTriangle } from "react-icons/hi2";

// Pengaman: bila satu halaman error saat dirender, tampilkan pesan + tombol muat ulang,
// bukan layar putih. Dipasang di FinanceLayout dengan key = alamat halaman, sehingga
// berpindah menu otomatis membersihkan error.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary]", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto mt-16 max-w-md rounded-2xl border border-rose-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
          <HiOutlineExclamationTriangle className="h-6 w-6" />
        </div>
        <h2 className="text-sm font-bold text-slate-800">Halaman ini mengalami kesalahan</h2>
        <p className="mt-1 text-xs text-slate-500">
          Tampilan tidak dapat dimuat. Coba muat ulang; bila terulang, sampaikan pesan di bawah ke tim IT.
        </p>
        <p className="mt-3 break-words rounded-lg bg-slate-50 p-2 text-left text-[11px] text-slate-500">
          {String(this.state.error?.message || this.state.error)}
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700"
        >
          Muat ulang halaman
        </button>
      </div>
    );
  }
}
