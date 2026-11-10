/**
 * Dimuat sebelum semua test (node --require). Test end-to-end MENGHAPUS isi database (rollback semua migrasi),
 * jadi selalu diarahkan ke database khusus test dan menolak database lain, apa pun isi DB_NAME di .env.
 */
if (process.env.RUN_DB_TESTS === '1') {
  const name = process.env.TEST_DB_NAME || 'ogo_driver_test'
  if (!name.endsWith('_test')) {
    throw new Error(`TEST_DB_NAME="${name}" ditolak: nama database test harus berakhiran "_test" agar data dev tidak terhapus.`)
  }
  process.env.DB_NAME = name
}
