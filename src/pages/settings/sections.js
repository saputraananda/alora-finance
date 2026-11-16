import {
  HiOutlineArrowsRightLeft,
  HiOutlineBuildingLibrary,
  HiOutlineBuildingStorefront,
  HiOutlineCreditCard,
  HiOutlineHashtag,
  HiOutlineScale,
  HiOutlineShoppingCart,
  HiOutlineTag,
} from "react-icons/hi2";

export const SETTINGS_BASE = "/finance-ho/pengaturan";

// Anak menu "Pengaturan Umum" di sidebar; semuanya satu tab aplikasi
export const SETTINGS_SECTIONS = [
  { id: "cabang", slug: "cabang", label: "Cabang", desc: "Go-live, akun kas, gudang", icon: HiOutlineBuildingStorefront, intro: "Cabang baru cukup didaftarkan di POS, lalu diatur akun kas dan tanggal mulai pakai alfi di sini." },
  { id: "metode", slug: "metode-bayar", label: "Metode Bayar", desc: "MDR, toleransi, cair", icon: HiOutlineCreditCard, intro: "Akun, tarif MDR, waktu cair, rekening tujuan, dan toleransi selisih per metode bayar POS." },
  { id: "bank", slug: "rekening-bank", label: "Rekening Bank", desc: "Per cabang dan akun COA", icon: HiOutlineBuildingLibrary, intro: "Rekening bank per cabang. Akun COA rekening dipakai di jurnal POS dan rekonsiliasi." },
  { id: "akun", slug: "pemetaan-akun", label: "Pemetaan Akun", desc: "Layanan POS ke pendapatan", icon: HiOutlineArrowsRightLeft, intro: "Kategori layanan POS ke akun pendapatan, dan akun yang dipakai untuk tiap peran (kas, piutang, selisih)." },
  { id: "klasifikasi", slug: "klasifikasi-pengajuan", label: "Klasifikasi Pengajuan", desc: "Biaya pengajuan ke akun", icon: HiOutlineShoppingCart, intro: "Klasifikasi biaya dari SuperApp yang dipilih Finance saat membayar pengajuan. Tiap klasifikasi dipetakan ke akun beban, atau akun aset bila barangnya disusutkan, supaya pembayaran dijurnal otomatis. Pemetaan disimpan di alfi, tidak mengubah SuperApp." },
  { id: "kategori", slug: "kategori-payment", label: "Kategori Payment", desc: "Label pencocokan bank", icon: HiOutlineTag, intro: "Label yang dipilih saat mencocokkan mutasi bank di Rekonsiliasi. Bukan metode bayar." },
  { id: "penomoran", slug: "penomoran", label: "Penomoran", desc: "Format nomor dokumen", icon: HiOutlineHashtag, intro: "Format nomor Jurnal Umum manual dan Rekon Code. Jurnal otomatis (POS, rekonsiliasi) memakai nomor tetap." },
  { id: "saldo", slug: "saldo-awal", label: "Saldo Awal", desc: "Saldo pembuka akun", icon: HiOutlineScale, intro: "Saldo pembuka setiap akun saat mulai memakai alfi." },
].map((s) => ({ ...s, to: `${SETTINGS_BASE}/${s.slug}` }));

export const settingsPath = (id) => SETTINGS_SECTIONS.find((s) => s.id === id)?.to || SETTINGS_BASE;
