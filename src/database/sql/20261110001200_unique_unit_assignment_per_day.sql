-- =====================================================================================
-- Versi SQL manual dari migrasi:
--   src/database/migrations/20261110001200_unique_unit_assignment_per_day.js
--
-- Aturan: satu unit hanya boleh ditugaskan ke satu driver per tanggal
--         (indeks unik driver_unit_assignments (unit_id, work_date)).
--
-- Cara pakai di DBeaver, pada DATABASE TENANT yang dituju:
--   1. Jalankan LANGKAH 1 (Ctrl+Enter) untuk melihat penugasan ganda. Hasil kosong = aman.
--      Bila ada hasil, hapus/pindahkan penugasan gandanya dulu (contoh di LANGKAH 1b).
--   2. Jalankan LANGKAH 2 dengan "Execute SQL Script" (Alt+X).
--   3. Jalankan LANGKAH 3 (Ctrl+Enter) untuk memastikan hasilnya.
--
-- Aman dijalankan berulang. LANGKAH 2 juga mencatat migrasi ini di tabel knex_migrations,
-- sehingga `npm run migrate` / rollout dari saas-api tidak menjalankannya lagi.
-- =====================================================================================


-- -------------------------------------------------------------------------------------
-- LANGKAH 1: cek penugasan ganda (unit yang dipegang lebih dari satu driver di tanggal yang sama)
-- -------------------------------------------------------------------------------------
SELECT
  u.plate,
  dua.work_date,
  count(*)                                            AS jumlah_driver,
  string_agg(d.code || ' - ' || us.name, ', ')        AS driver,
  string_agg(dua.id::text, ', ')                      AS assignment_ids
FROM driver_unit_assignments dua
JOIN units   u  ON u.id  = dua.unit_id
JOIN drivers d  ON d.id  = dua.driver_id
JOIN users   us ON us.id = d.user_id
GROUP BY u.plate, dua.unit_id, dua.work_date
HAVING count(*) > 1
ORDER BY dua.work_date, u.plate;

-- LANGKAH 1b (opsional, sesuaikan dulu): hapus penugasan yang tidak dipakai, pilih id dari kolom assignment_ids.
-- Pastikan driver penugasan itu belum P2H / belum mengerjakan DO dengan unit tsb.
-- DELETE FROM driver_unit_assignments WHERE id = '<assignment_id>';


-- -------------------------------------------------------------------------------------
-- LANGKAH 2: buat indeks unik + catat migrasi (Execute SQL Script / Alt+X)
-- -------------------------------------------------------------------------------------
BEGIN;

DO $$
DECLARE
  dup text;
BEGIN
  SELECT string_agg(format('%s (%s, %s driver)', x.plate, x.work_date, x.n), ', ')
    INTO dup
  FROM (
    SELECT u.plate, dua.work_date, count(*) AS n
    FROM driver_unit_assignments dua
    JOIN units u ON u.id = dua.unit_id
    GROUP BY u.plate, dua.unit_id, dua.work_date
    HAVING count(*) > 1
    ORDER BY dua.work_date, u.plate
  ) x;

  IF dup IS NOT NULL THEN
    RAISE EXCEPTION 'Ada unit yang ditugaskan ke lebih dari satu driver pada tanggal yang sama: %. Hapus atau pindahkan penugasan gandanya (LANGKAH 1) lalu jalankan lagi.', dup;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS driver_unit_assignments_unit_date_uq
  ON driver_unit_assignments (unit_id, work_date);

-- Catat di knex_migrations (batch baru) bila belum tercatat
INSERT INTO knex_migrations (name, batch, migration_time)
SELECT '20261110001200_unique_unit_assignment_per_day.js',
       coalesce((SELECT max(batch) FROM knex_migrations), 0) + 1,
       now()
WHERE NOT EXISTS (
  SELECT 1 FROM knex_migrations WHERE name = '20261110001200_unique_unit_assignment_per_day.js'
);

COMMIT;


-- -------------------------------------------------------------------------------------
-- LANGKAH 3: verifikasi
-- -------------------------------------------------------------------------------------
SELECT indexname, indexdef FROM pg_indexes WHERE indexname = 'driver_unit_assignments_unit_date_uq';
SELECT name, batch, migration_time FROM knex_migrations WHERE name = '20261110001200_unique_unit_assignment_per_day.js';


-- -------------------------------------------------------------------------------------
-- ROLLBACK (bila perlu membatalkan): hapus indeks dan catatan migrasinya
-- -------------------------------------------------------------------------------------
-- BEGIN;
-- DROP INDEX IF EXISTS driver_unit_assignments_unit_date_uq;
-- DELETE FROM knex_migrations WHERE name = '20261110001200_unique_unit_assignment_per_day.js';
-- COMMIT;
