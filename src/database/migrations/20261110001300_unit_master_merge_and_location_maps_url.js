// Perubahan master unit dan lokasi pada database yang sudah ada (migrasi lama tidak diubah):
//  1. Tipe unit digabung ke master unit: units.unit_type (teks bebas) + units.max_load_kg; tabel unit_types dan units.unit_type_id dihapus
//  2. Nomor rangka (units.vin_number, unik di antara unit aktif)
//  3. Driver bawaan unit (units.driver_id, satu driver maksimal satu unit aktif)
//  4. Tautan Google Maps lokasi (locations.maps_url)
//  5. Hak akses role: unit_types dan unit_assignments dibuang (endpoint-nya sudah tidak ada)
// Idempoten (IF NOT EXISTS / dicek dulu), jadi aman bila sebagian sudah dijalankan lewat skrip SQL manual (docs/sql).
exports.up = async (knex) => {
  // 1-3. kolom baru di units
  await knex.raw('ALTER TABLE units ADD COLUMN IF NOT EXISTS unit_type text')
  await knex.raw('ALTER TABLE units ADD COLUMN IF NOT EXISTS max_load_kg integer')
  await knex.raw('ALTER TABLE units ADD COLUMN IF NOT EXISTS vin_number text')
  await knex.raw('ALTER TABLE units ADD COLUMN IF NOT EXISTS driver_id uuid')

  // isi tipe unit dari master lama, lalu buang rujukannya
  if (await knex.schema.hasColumn('units', 'unit_type_id')) {
    await knex.raw(`
      UPDATE units u
         SET unit_type = t.name, max_load_kg = COALESCE(u.max_load_kg, t.max_load_kg)
        FROM unit_types t
       WHERE t.id = u.unit_type_id AND u.unit_type IS NULL
    `)
    await knex.raw('ALTER TABLE units DROP COLUMN unit_type_id')
  }
  await knex.raw("UPDATE units SET unit_type = 'Lainnya' WHERE unit_type IS NULL")
  await knex.raw('ALTER TABLE units ALTER COLUMN unit_type SET NOT NULL')
  await knex.raw('DROP TABLE IF EXISTS unit_types')

  await knex.raw('CREATE UNIQUE INDEX IF NOT EXISTS units_vin_uq ON units (vin_number) WHERE vin_number IS NOT NULL AND is_delete = false')
  await knex.raw('CREATE UNIQUE INDEX IF NOT EXISTS units_driver_uq ON units (driver_id) WHERE driver_id IS NOT NULL AND is_delete = false')
  await knex.raw(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'units_driver_id_foreign') THEN
        ALTER TABLE units ADD CONSTRAINT units_driver_id_foreign FOREIGN KEY (driver_id) REFERENCES drivers (id);
      END IF;
    END $$
  `)

  // 4. lokasi
  await knex.raw('ALTER TABLE locations ADD COLUMN IF NOT EXISTS maps_url text')

  // 5. hak akses lama
  await knex.raw("UPDATE roles SET permissions = permissions - 'unit_types' - 'unit_assignments' WHERE jsonb_exists_any(permissions, array['unit_types', 'unit_assignments'])")
}

// Tidak dikembalikan sepenuhnya: tipe unit yang sudah berupa teks tidak bisa dipetakan balik ke master tipe.
// Rollback tetap jalan (migrasi pembuat tabel units akan menghapus tabelnya); di sini hanya kolom lokasi yang dilepas.
exports.down = async (knex) => {
  await knex.raw('ALTER TABLE locations DROP COLUMN IF EXISTS maps_url')
}
