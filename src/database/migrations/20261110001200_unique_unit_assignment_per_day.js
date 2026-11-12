// Satu unit hanya boleh ditugaskan ke satu driver per tanggal (sebelumnya boleh beberapa driver).
// Indeks unik menjaga aturan ini juga saat dua admin menyimpan penugasan bersamaan.
// Versi SQL manual (DBeaver): src/database/sql/20261110001200_unique_unit_assignment_per_day.sql
// IF NOT EXISTS: aman bila indeks sudah dibuat manual sebelumnya.
exports.up = async (knex) => {
  const { rows: duplicates } = await knex.raw(`
    SELECT u.plate, dua.work_date::text AS work_date, count(*)::int AS drivers
    FROM driver_unit_assignments dua
    JOIN units u ON u.id = dua.unit_id
    GROUP BY u.plate, dua.unit_id, dua.work_date
    HAVING count(*) > 1
    ORDER BY dua.work_date, u.plate
  `)
  if (duplicates.length) {
    const list = duplicates.map((d) => `${d.plate} (${d.work_date}, ${d.drivers} driver)`).join(', ')
    throw new Error(
      `Ada unit yang ditugaskan ke lebih dari satu driver pada tanggal yang sama: ${list}. `
      + 'Hapus atau pindahkan penugasan gandanya (tabel driver_unit_assignments) lalu jalankan migrasi lagi.'
    )
  }
  await knex.raw('CREATE UNIQUE INDEX IF NOT EXISTS driver_unit_assignments_unit_date_uq ON driver_unit_assignments (unit_id, work_date)')
}

exports.down = async (knex) => {
  await knex.raw('DROP INDEX IF EXISTS driver_unit_assignments_unit_date_uq')
}
