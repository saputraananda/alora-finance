// Master outlet SuperApp kini ada di DB My Waschen (waschen.mst_outlet tidak dipakai lagi sejak 2026-11-18).
// Query di koneksi DB utama (mainPool) yang butuh nama outlet memakai JOIN lintas database:
//   LEFT JOIN ${mstOutlet()} o ON o.id = x.outlet_id
// Kedua DB ada di server MySQL yang sama dan diakses user yang sama.
export function mstOutlet() {
  const db = (process.env.DB_NAME_MY_WASCHEN || 'my_waschen').replace(/`/g, '');
  return `\`${db}\`.mst_outlet`;
}
