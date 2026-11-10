-- =====================================================================
-- OGO Service - DRAFT skema PostgreSQL (>= 13)
-- Status: usulan untuk direview. BELUM dijalankan oleh migrasi.
-- Setelah disepakati, pecah menjadi file migrasi knex di src/database/migrations.
--
-- Prinsip:
--  * PK uuid (gen_random_uuid). Nomor manusiawi (DO-0144, DRV-0021) di kolom terpisah + UNIQUE.
--  * Semua waktu timestamptz. Simpan waktu HP (captured_at/recorded_at) DAN waktu server (created_at).
--  * Uang bigint Rupiah. Jarak/liter numeric.
--  * Status pakai text + CHECK (mudah ditambah nilai baru, beda dengan ENUM Postgres).
--  * client_ref (UUID dari HP) + UNIQUE per user -> idempotensi & sync offline.
--  * Data master (alamat, PIC, plat) di-snapshot ke DO saat dibuat, supaya riwayat tidak berubah.
--  * OCR, koreksi, dan nilai efektif disimpan terpisah untuk audit.
--  * Soft delete (deleted_at) hanya di tabel master. Data transaksi tidak dihapus.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Helper: updated_at otomatis
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- 1. IDENTITAS & AKSES
-- =====================================================================

-- Satu tabel login untuk semua peran (driver, admin, dispatcher, finance).
CREATE TABLE users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username           text NOT NULL,                 -- DRV-0021 / admin.budi
  phone              text,                          -- format E.164: +62812...
  email              text,
  password_hash      text NOT NULL,                 -- bcrypt
  role               text NOT NULL CHECK (role IN ('driver', 'admin', 'dispatcher', 'finance')),
  name               text NOT NULL,
  language           text NOT NULL DEFAULT 'id' CHECK (language IN ('id', 'en', 'zh')),
  status             text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  failed_login_count int  NOT NULL DEFAULT 0,       -- untuk remaining_attempts
  locked_until       timestamptz,
  last_login_at      timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);
CREATE UNIQUE INDEX users_username_uq ON users (lower(username)) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX users_phone_uq    ON users (phone)           WHERE deleted_at IS NULL AND phone IS NOT NULL;
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Profil khusus driver (1:1 dengan users role=driver)
CREATE TABLE drivers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL UNIQUE REFERENCES users (id),
  code                text NOT NULL UNIQUE,         -- DRV-0021
  license_no          text,                         -- No. SIM
  license_type        text,                         -- B1, B2 Umum, ...
  license_expires_on  date,
  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz
);
CREATE TRIGGER drivers_updated_at BEFORE UPDATE ON drivers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Perangkat (HP) yang dipakai login + FCM token untuk push
CREATE TABLE devices (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users (id),
  device_id     text NOT NULL,                      -- android-7f3a
  platform      text NOT NULL DEFAULT 'android',
  os_version    text,
  app_version   text,
  fcm_token     text,
  last_seen_at  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_id)
);
CREATE TRIGGER devices_updated_at BEFORE UPDATE ON devices FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Refresh token: simpan HASH-nya saja, rotasi tiap refresh, deteksi reuse lewat family_id
CREATE TABLE refresh_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users (id),
  device_id     uuid REFERENCES devices (id),
  family_id     uuid NOT NULL,                      -- sama untuk satu rantai rotasi
  token_hash    text NOT NULL UNIQUE,               -- sha256(token)
  expires_at    timestamptz NOT NULL,
  revoked_at    timestamptz,
  replaced_by   uuid REFERENCES refresh_tokens (id),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id) WHERE revoked_at IS NULL;

-- =====================================================================
-- 2. MASTER DATA
-- =====================================================================

CREATE TABLE unit_types (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text NOT NULL UNIQUE,               -- CDD_BAK, FUSO_BOX
  name         text NOT NULL,                      -- CDD Bak
  max_load_kg  int,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE units (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plate                text NOT NULL,              -- B 9123 KZ
  unit_type_id         uuid NOT NULL REFERENCES unit_types (id),
  brand                text,
  year                 smallint,
  last_odometer_km     int,                        -- di-update saat odometer end
  status               text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'maintenance', 'inactive')),
  stnk_expires_on      date,
  kir_expires_on       date,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);
CREATE UNIQUE INDEX units_plate_uq ON units (upper(replace(plate, ' ', ''))) WHERE deleted_at IS NULL;
CREATE TRIGGER units_updated_at BEFORE UPDATE ON units FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Penugasan unit harian (unit_today di bootstrap / me)
CREATE TABLE driver_unit_assignments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id    uuid NOT NULL REFERENCES drivers (id),
  unit_id      uuid NOT NULL REFERENCES units (id),
  work_date    date NOT NULL,
  assigned_by  uuid REFERENCES users (id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (driver_id, work_date)
);
CREATE INDEX dua_unit_date_idx ON driver_unit_assignments (unit_id, work_date);

CREATE TABLE customers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  name        text NOT NULL,                       -- PT Contoh Jaya
  phone       text,
  email       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE TRIGGER customers_updated_at BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Gudang, depot, dan alamat tujuan customer
CREATE TABLE locations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id      uuid REFERENCES customers (id), -- null untuk gudang/depot sendiri
  type             text NOT NULL CHECK (type IN ('warehouse', 'depot', 'customer_site')),
  name             text NOT NULL,                  -- Gudang Cakung
  address          text NOT NULL,
  city             text,
  lat              numeric(9, 6),
  lng              numeric(9, 6),
  geofence_radius_m int DEFAULT 200,               -- validasi GPS saat muat / serah terima
  operating_hours  text,                           -- 08:00-17:00
  pic_name         text,
  pic_phone        text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);
CREATE INDEX locations_customer_idx ON locations (customer_id);
CREATE TRIGGER locations_updated_at BEFORE UPDATE ON locations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =====================================================================
-- 3. KONFIGURASI (sumber GET /config)
-- =====================================================================

-- Key-value berversi; config_version = max(updated_at) atau kolom versi manual
CREATE TABLE app_settings (
  key         text PRIMARY KEY,                    -- modules, photo_rules, p2h, ...
  value       jsonb NOT NULL,
  updated_by  uuid REFERENCES users (id),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE expense_categories (
  code                  text PRIMARY KEY,          -- bbm, tol, parkir, lainnya
  label                 text NOT NULL,
  input                 text NOT NULL CHECK (input IN ('receipt_ocr', 'manual')),
  description_required  boolean NOT NULL DEFAULT false,
  proof_required        boolean NOT NULL DEFAULT false,
  sort_order            int NOT NULL DEFAULT 0,
  is_active             boolean NOT NULL DEFAULT true
);

CREATE TABLE p2h_check_items (
  code         text PRIMARY KEY,                   -- ban, oli, lampu, rem
  label        text NOT NULL,
  hint         text,
  is_critical  boolean NOT NULL DEFAULT false,      -- tidak_sesuai pada item kritis -> tidak_layak
  sort_order   int NOT NULL DEFAULT 0,
  is_active    boolean NOT NULL DEFAULT true
);

-- =====================================================================
-- 4. MEDIA (semua foto)
-- =====================================================================

CREATE TABLE media (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind                text NOT NULL CHECK (kind IN (
                        'odometer_start', 'odometer_end', 'receipt', 'loading', 'delivery_note',
                        'unloading', 'stamped_delivery_note', 'p2h_body', 'damage', 'location', 'signature')),
  storage_key         text NOT NULL,                -- media/2026/11/05/<uuid>.jpg
  thumb_key           text,
  mime_type           text NOT NULL,
  size_bytes          int  NOT NULL,
  sha256              text NOT NULL,                -- deteksi foto dipakai ulang
  source              text NOT NULL DEFAULT 'camera' CHECK (source IN ('camera')),
  captured_at         timestamptz NOT NULL,         -- waktu di HP
  server_received_at  timestamptz NOT NULL DEFAULT now(),
  lat                 numeric(9, 6),
  lng                 numeric(9, 6),
  gps_accuracy_m      numeric(7, 2),
  captured_by         uuid NOT NULL REFERENCES users (id),
  client_ref          uuid NOT NULL,
  UNIQUE (captured_by, client_ref)
);
CREATE INDEX media_sha256_idx ON media (sha256);

-- =====================================================================
-- 5. P2H (pemeriksaan harian, per unit per hari)
-- =====================================================================

CREATE TABLE p2h_inspections (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id                    uuid NOT NULL REFERENCES units (id),
  inspection_date            date NOT NULL,         -- tanggal lokal Asia/Jakarta
  status                     text NOT NULL CHECK (status IN ('layak', 'catatan', 'tidak_layak')),
  can_operate                boolean NOT NULL,
  checked_by                 uuid NOT NULL REFERENCES drivers (id),
  checked_at                 timestamptz NOT NULL,
  location_id                uuid REFERENCES locations (id),
  lat                        numeric(9, 6),
  lng                        numeric(9, 6),
  gps_accuracy_m             numeric(7, 2),
  admin_confirmed_by_driver  boolean,
  valid_until                timestamptz NOT NULL,
  -- P2H ulang diminta admin: baris lama ditandai superseded, baris baru dibuat
  superseded_at              timestamptz,
  recheck_requested_by       uuid REFERENCES users (id),
  recheck_requested_at       timestamptz,
  recheck_note               text,
  client_ref                 uuid NOT NULL,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (checked_by, client_ref)
);
-- hanya satu P2H aktif per unit per hari
CREATE UNIQUE INDEX p2h_current_uq ON p2h_inspections (unit_id, inspection_date) WHERE superseded_at IS NULL;

CREATE TABLE p2h_inspection_items (
  inspection_id  uuid NOT NULL REFERENCES p2h_inspections (id) ON DELETE CASCADE,
  item_code      text NOT NULL REFERENCES p2h_check_items (code),
  label          text NOT NULL,                    -- snapshot label saat diperiksa
  result         text NOT NULL CHECK (result IN ('sesuai', 'tidak_sesuai')),
  description    text,
  PRIMARY KEY (inspection_id, item_code),
  CHECK (result = 'sesuai' OR description IS NOT NULL)
);

CREATE TABLE p2h_inspection_photos (
  inspection_id  uuid NOT NULL REFERENCES p2h_inspections (id) ON DELETE CASCADE,
  side           text NOT NULL CHECK (side IN ('depan', 'kanan', 'kiri', 'belakang')),
  media_id       uuid NOT NULL REFERENCES media (id),
  PRIMARY KEY (inspection_id, side)
);

-- =====================================================================
-- 6. DELIVERY ORDER
-- =====================================================================

CREATE SEQUENCE delivery_order_no_seq;

CREATE TABLE delivery_orders (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  no                       text NOT NULL UNIQUE,   -- DO-0144 (dari delivery_order_no_seq)
  customer_id              uuid REFERENCES customers (id),
  driver_id                uuid NOT NULL REFERENCES drivers (id),
  unit_id                  uuid NOT NULL REFERENCES units (id),

  -- status alur kerja
  status                   text NOT NULL DEFAULT 'assigned' CHECK (status IN (
                             'assigned', 'accepted', 'loading', 'in_transit', 'handover', 'completed', 'cancelled')),
  -- hasil pengiriman (diisi saat handover)
  delivery_status          text CHECK (delivery_status IN ('terkirim_lengkap', 'terkirim_catatan', 'gagal_kirim')),

  -- asal & tujuan: FK + snapshot (alamat master bisa berubah, riwayat DO tidak boleh)
  origin_location_id       uuid REFERENCES locations (id),
  origin_snapshot          jsonb NOT NULL,         -- {name,address,lat,lng}
  destination_location_id  uuid REFERENCES locations (id),
  destination_snapshot     jsonb NOT NULL,         -- {name,city,address,lat,lng,operating_hours,pic:{name,phone}}
  planned_load_at          timestamptz,

  cargo_description        text NOT NULL,          -- 4 palet
  cargo_quantity           numeric(12, 2) NOT NULL,
  cargo_unit               text NOT NULL,          -- palet
  estimated_distance_km    numeric(8, 1),

  travel_allowance_amount  bigint NOT NULL DEFAULT 0 CHECK (travel_allowance_amount >= 0),
  travel_allowance_received_at timestamptz,

  assigned_by              uuid NOT NULL REFERENCES users (id),
  assigned_at              timestamptz NOT NULL DEFAULT now(),
  accepted_at              timestamptz,
  started_at               timestamptz,            -- saat odometer start
  completed_at             timestamptz,
  locked_at                timestamptz,            -- setelah complete: tidak bisa diubah dari app
  cancelled_at             timestamptz,
  cancel_reason            text,

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX do_driver_status_idx  ON delivery_orders (driver_id, status);
CREATE INDEX do_driver_completed_idx ON delivery_orders (driver_id, completed_at DESC, id DESC); -- riwayat (cursor)
CREATE INDEX do_unit_idx ON delivery_orders (unit_id);
-- satu driver hanya boleh punya satu DO aktif
CREATE UNIQUE INDEX do_one_active_per_driver_uq ON delivery_orders (driver_id)
  WHERE status IN ('accepted', 'loading', 'in_transit', 'handover');
CREATE TRIGGER delivery_orders_updated_at BEFORE UPDATE ON delivery_orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Jejak setiap perubahan status (audit + timeline admin)
CREATE TABLE delivery_order_events (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  delivery_order_id  uuid NOT NULL REFERENCES delivery_orders (id),
  event              text NOT NULL,                -- assigned, accepted, loaded, odometer_start, expense_added, handover, completed...
  from_status        text,
  to_status          text,
  actor_id           uuid REFERENCES users (id),
  occurred_at        timestamptz NOT NULL,         -- waktu di HP
  lat                numeric(9, 6),
  lng                numeric(9, 6),
  payload            jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX doe_do_idx ON delivery_order_events (delivery_order_id, occurred_at);

-- Foto yang menempel ke DO (muat, surat jalan, bongkar, surat jalan cap, TTD, lokasi gagal)
CREATE TABLE delivery_order_media (
  delivery_order_id  uuid NOT NULL REFERENCES delivery_orders (id),
  media_id           uuid NOT NULL REFERENCES media (id),
  purpose            text NOT NULL CHECK (purpose IN (
                       'loading', 'delivery_note', 'unloading', 'stamped_delivery_note', 'signature', 'location')),
  page_no            smallint,                     -- halaman surat jalan
  sort_order         smallint NOT NULL DEFAULT 0,
  PRIMARY KEY (delivery_order_id, media_id)
);

-- =====================================================================
-- 7. LANGKAH PERJALANAN
-- =====================================================================

CREATE TABLE loadings (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_order_id    uuid NOT NULL UNIQUE REFERENCES delivery_orders (id),
  loaded_at            timestamptz NOT NULL,
  lat                  numeric(9, 6),
  lng                  numeric(9, 6),
  gps_accuracy_m       numeric(7, 2),
  quantity_matches_do  boolean NOT NULL,
  quantity_note        text,
  created_by           uuid NOT NULL REFERENCES users (id),
  client_ref           uuid NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (created_by, client_ref),
  CHECK (quantity_matches_do OR quantity_note IS NOT NULL)
);

CREATE TABLE odometer_readings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_order_id   uuid NOT NULL REFERENCES delivery_orders (id),
  type                text NOT NULL CHECK (type IN ('start', 'end')),
  media_id            uuid NOT NULL REFERENCES media (id),
  ocr_km              int,
  ocr_fuel_level      text,
  corrected_km        int,
  corrected_fuel_level text,
  correction_reason   text,
  effective_km        int  NOT NULL,              -- corrected ?? ocr (dihitung di service)
  effective_fuel_level text CHECK (effective_fuel_level IN ('empty', 'quarter', 'half', 'three_quarter', 'full')),
  effective_source    text NOT NULL CHECK (effective_source IN ('ocr', 'corrected')),
  captured_at         timestamptz NOT NULL,
  lat                 numeric(9, 6),
  lng                 numeric(9, 6),
  gps_accuracy_m      numeric(7, 2),
  created_by          uuid NOT NULL REFERENCES users (id),
  client_ref          uuid NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (delivery_order_id, type),
  UNIQUE (created_by, client_ref),
  CHECK ((corrected_km IS NULL AND corrected_fuel_level IS NULL) OR correction_reason IS NOT NULL)
);

CREATE TABLE expenses (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_order_id  uuid NOT NULL REFERENCES delivery_orders (id),
  category_code      text NOT NULL REFERENCES expense_categories (code),
  amount             bigint NOT NULL CHECK (amount >= 0),   -- nilai efektif
  description        text,
  proof_media_id     uuid REFERENCES media (id),            -- struk BBM / bukti manual
  -- khusus BBM (struk + OCR)
  merchant           text,
  fuel_type          text,
  liters             numeric(8, 2),
  price_per_liter    bigint,
  receipt_time       time,
  ocr_fields         jsonb,                                 -- hasil OCR mentah
  corrected_fields   jsonb,                                 -- hanya field yang dikoreksi
  correction_reason  text,
  checks             jsonb,                                 -- {liters_x_price_matches_total,...}
  receipt_fingerprint text,                                 -- hash(merchant|tanggal|jam|total) untuk DUPLICATE_RECEIPT
  recorded_at        timestamptz NOT NULL,                  -- waktu di HP
  lat                numeric(9, 6),
  lng                numeric(9, 6),
  gps_accuracy_m     numeric(7, 2),
  created_by         uuid NOT NULL REFERENCES users (id),
  client_ref         uuid NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  voided_at          timestamptz,                           -- dibatalkan admin, tidak dihapus
  voided_by          uuid REFERENCES users (id),
  UNIQUE (created_by, client_ref),
  CHECK (corrected_fields IS NULL OR correction_reason IS NOT NULL)
);
CREATE INDEX expenses_do_idx ON expenses (delivery_order_id) WHERE voided_at IS NULL;
CREATE UNIQUE INDEX expenses_receipt_uq ON expenses (receipt_fingerprint)
  WHERE receipt_fingerprint IS NOT NULL AND voided_at IS NULL;

CREATE TABLE handovers (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_order_id    uuid NOT NULL UNIQUE REFERENCES delivery_orders (id),
  condition            text NOT NULL CHECK (condition IN ('lengkap', 'masalah', 'gagal_kirim')),
  received_quantity    numeric(12, 2),
  failure_reason       text CHECK (failure_reason IN ('penerima_tidak_ada', 'alamat_tidak_ditemukan', 'ditolak_penerima', 'lainnya')),
  note                 text,
  receiver_name        text,
  signature_media_id   uuid REFERENCES media (id),
  signed_at            timestamptz,
  acknowledges_issues  boolean,
  recorded_at          timestamptz NOT NULL,
  lat                  numeric(9, 6),
  lng                  numeric(9, 6),
  gps_accuracy_m       numeric(7, 2),
  created_by           uuid NOT NULL REFERENCES users (id),
  client_ref           uuid NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (created_by, client_ref),
  CHECK (condition <> 'gagal_kirim' OR failure_reason IS NOT NULL),
  CHECK (condition = 'gagal_kirim' OR (receiver_name IS NOT NULL AND signature_media_id IS NOT NULL))
);

CREATE TABLE handover_issues (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  handover_id  uuid NOT NULL REFERENCES handovers (id) ON DELETE CASCADE,
  type         text NOT NULL CHECK (type IN ('rusak', 'kurang', 'salah_kirim', 'lainnya')),
  quantity     numeric(12, 2) NOT NULL CHECK (quantity > 0),
  unit         text NOT NULL,
  note         text
);

CREATE TABLE handover_issue_photos (
  issue_id  uuid NOT NULL REFERENCES handover_issues (id) ON DELETE CASCADE,
  media_id  uuid NOT NULL REFERENCES media (id),
  PRIMARY KEY (issue_id, media_id)
);

-- Rekap keuangan per DO, dibekukan saat complete
CREATE TABLE settlements (
  delivery_order_id  uuid PRIMARY KEY REFERENCES delivery_orders (id),
  travel_allowance   bigint NOT NULL,
  expense_total      bigint NOT NULL,
  type               text NOT NULL CHECK (type IN ('refund_to_company', 'payable_to_driver', 'balanced')),
  amount             bigint NOT NULL CHECK (amount >= 0),
  distance_km        numeric(8, 1),
  duration_minutes   int,
  settled_at         timestamptz,                -- diisi finance saat uang disetor / dibayar
  settled_by         uuid REFERENCES users (id),
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================
-- 8. IDEMPOTENSI & SYNC OFFLINE
-- =====================================================================

-- Setiap request ber-client_ref dicatat; request ulang mengembalikan response yang sama
CREATE TABLE idempotency_keys (
  user_id        uuid NOT NULL REFERENCES users (id),
  client_ref     uuid NOT NULL,
  method         text NOT NULL,
  path           text NOT NULL,
  request_hash   text NOT NULL,                  -- tolak jika client_ref sama tapi body beda
  status_code    int,
  response_body  jsonb,
  resource_type  text,                           -- expense, odometer, ...
  resource_id    uuid,
  client_created_at timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, client_ref)
);
CREATE INDEX idempotency_created_idx ON idempotency_keys (created_at); -- untuk purge berkala

-- =====================================================================
-- 9. NOTIFIKASI & AUDIT
-- =====================================================================

CREATE TABLE notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users (id),
  type        text NOT NULL,                     -- do_assigned, p2h_recheck_requested
  payload     jsonb NOT NULL,
  sent_at     timestamptz,
  error       text,
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);

-- Perubahan oleh admin (koreksi biaya, batal DO, minta P2H ulang, dll)
CREATE TABLE audit_logs (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id     uuid REFERENCES users (id),
  action       text NOT NULL,
  entity_type  text NOT NULL,
  entity_id    uuid,
  before_data  jsonb,
  after_data   jsonb,
  ip           inet,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_entity_idx ON audit_logs (entity_type, entity_id);
