import TrenPendapatan from "./widgets/TrenPendapatan";
import SinkronPos from "./widgets/SinkronPos";
import LabaRugi from "./widgets/LabaRugi";
import Beban from "./widgets/Beban";
import ArusKas from "./widgets/ArusKas";
import MetodeBayar from "./widgets/MetodeBayar";
import RekonKas from "./widgets/RekonKas";
import BiayaBayar from "./widgets/BiayaBayar";
import Rekonsiliasi from "./widgets/Rekonsiliasi";
import PerluTindakan from "./widgets/PerluTindakan";
import Aging from "./widgets/Aging";
import Volume from "./widgets/Volume";
import JurnalTerkini from "./widgets/JurnalTerkini";

// Katalog widget.
//  span = lebar di grid 3 kolom (1 / 2 / 3).
//  unit = true bila datanya bisa dipisah per unit (Waschen / Cleanox). Bila filter unit menyala,
//         widget dengan unit=false disembunyikan supaya yang tampil hanya data unit terpilih.
// Id disimpan di mst_dashboard_layout, jadi jangan diganti setelah dipakai.
export const WIDGETS = {
  "pos-sync": { title: "Sinkronisasi POS", desc: "Status posting POS tiap cabang dan Cleanox pada hari lengkap terakhir.", span: 1, unit: true, Component: SinkronPos },
  "tren-pendapatan": { title: "Tren Pendapatan", desc: "Grafik pendapatan harian per unit (Waschen & Cleanox) dari POS.", span: 1, unit: true, Component: TrenPendapatan },
  "perlu-tindakan": { title: "Perlu tindakan", desc: "Daftar hal yang harus diselesaikan: posting POS, rekonsiliasi, QRIS/EDC belum cair.", span: 1, unit: false, Component: PerluTindakan },
  "laba-rugi": { title: "Laba / Rugi", desc: "Pendapatan, beban, laba, margin, dan perbandingan dengan periode sebelumnya.", span: 1, unit: true, Component: LabaRugi },
  beban: { title: "Beban Perusahaan", desc: "5 beban terbesar dalam bentuk donat, plus penyerapan anggaran.", span: 1, unit: true, Component: Beban },
  "arus-kas": { title: "Arus Kas", desc: "Uang masuk dan keluar rekening bank 7 hari terakhir serta saldo bank.", span: 1, unit: false, Component: ArusKas },
  "metode-bayar": { title: "Penjualan per Metode Bayar", desc: "Pembayaran POS per metode: tunai, QRIS, EDC, transfer, deposit.", span: 1, unit: true, Component: MetodeBayar },
  "rekon-kas": { title: "Rekonsiliasi & Kas", desc: "Hari cocok, selisih kas, QRIS/EDC belum cair, dan beban MDR.", span: 1, unit: false, Component: RekonKas },
  "biaya-bayar": { title: "Biaya & Pembayaran", desc: "Antrean Finance, menunggu bayar, dan hutang kredit dari menu Pembelian.", span: 1, unit: true, Component: BiayaBayar },
  rekonsiliasi: { title: "Rekonsiliasi 8 hari terakhir", desc: "Status rekonsiliasi harian tiap cabang.", span: 3, unit: false, Component: Rekonsiliasi },
  aging: { title: "Aging piutang ritel", desc: "Nota POS belum lunas menurut umur, plus 5 pelanggan terbesar.", span: 3, unit: true, Component: Aging },
  volume: { title: "Volume cucian", desc: "Total kg dan pcs cucian pada rentang terpilih.", span: 1, unit: false, Component: Volume },
  "jurnal-terkini": { title: "Transaksi Jurnal Terkini", desc: "5 jurnal terakhir yang sudah dibukukan.", span: 3, unit: false, Component: JurnalTerkini },
};

// Tampilan awal (volume & jurnal terkini bisa ditambahkan lewat tombol Widget)
export const DEFAULT_LAYOUT = [
  "pos-sync",
  "tren-pendapatan",
  "perlu-tindakan",
  "laba-rugi",
  "beban",
  "arus-kas",
  "metode-bayar",
  "rekon-kas",
  "biaya-bayar",
  "rekonsiliasi",
  "aging",
];

// Buang id yang tidak dikenal (mis. widget yang sudah dihapus dari katalog)
export const sanitizeLayout = (ids) => (Array.isArray(ids) ? ids.filter((id) => WIDGETS[id]) : []);
