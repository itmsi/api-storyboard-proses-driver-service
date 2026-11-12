-- =====================================================================================
-- DATA DUMMY MASTER DATA (unit_types, units, customers, locations)
-- Jalankan manual di DBeaver pada DATABASE TENANT yang dituju (satu database per client),
-- pakai "Execute SQL Script" (Alt+X), bukan "Execute statement" (Ctrl+Enter).
--
-- - Aman dijalankan berulang: data yang sudah ada (kode / plat / nama lokasi sama) dilewati.
-- - created_by / updated_by diisi akun admin perusahaan pertama (fallback: akun admin mana pun).
-- - Urutan penting: unit_types -> units, customers -> locations (FK).
-- - Format mengikuti aturan API: kode huruf besar/angka/_/-, plat bentuk baku "B 9123 KZ",
--   operating_hours "HH:mm-HH:mm", customer_site wajib customer_id, warehouse/depot tanpa customer.
-- =====================================================================================

BEGIN;

-- -------------------------------------------------------------------------------------
-- 1. UNIT TYPES (20 baru + melengkapi kapasitas 7 tipe bawaan migrasi)
-- -------------------------------------------------------------------------------------
UPDATE unit_types t
SET max_load_kg = v.max_load_kg
FROM (VALUES
  ('CDD_BAK', 2500), ('CDD_BOX', 2500), ('FUSO_BAK', 6000), ('FUSO_BOX', 6000),
  ('TRONTON', 15000), ('WINGBOX', 15000), ('TRAILER', 30000)
) AS v(code, max_load_kg)
WHERE t.code = v.code AND t.is_delete = false AND t.max_load_kg IS NULL;

WITH admin AS (
  SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
  WHERE r.user_type = 'admin' AND u.is_delete = false
  ORDER BY u.is_system, u.created_at LIMIT 1
)
INSERT INTO unit_types (code, name, max_load_kg, created_by, updated_by)
SELECT v.code, v.name, v.max_load_kg, (SELECT id FROM admin), (SELECT id FROM admin)
FROM (VALUES
  ('PICKUP',           'Pickup Bak',            1000),
  ('PICKUP_BOX',       'Pickup Box',            1000),
  ('BLIND_VAN',        'Blind Van',              800),
  ('CDE_BAK',          'CDE Bak (Engkel)',      2200),
  ('CDE_BOX',          'CDE Box (Engkel)',      2000),
  ('CDE_REEFER',       'CDE Reefer',            1800),
  ('CDD_LONG',         'CDD Long Bak',          5000),
  ('CDD_LONG_BOX',     'CDD Long Box',          5000),
  ('CDD_REEFER',       'CDD Reefer',            4000),
  ('FUSO_LONG',        'Fuso Long Bak',         8000),
  ('FUSO_REEFER',      'Fuso Reefer',           7000),
  ('TRONTON_BOX',      'Tronton Box',          15000),
  ('TRONTON_WINGBOX',  'Tronton Wingbox',      15000),
  ('TRINTIN',          'Trintin Bak',          20000),
  ('TRINTIN_WINGBOX',  'Trintin Wingbox',      22000),
  ('TRAILER_20FT',     'Trailer 20 Feet',      25000),
  ('TRAILER_40FT',     'Trailer 40 Feet',      30000),
  ('TRAILER_FLATBED',  'Trailer Flatbed',      30000),
  ('TANKI_8KL',        'Truk Tangki 8 KL',      8000),
  ('DUMP_TRUCK',       'Dump Truck',           10000)
) AS v(code, name, max_load_kg)
WHERE NOT EXISTS (SELECT 1 FROM unit_types t WHERE t.code = v.code AND t.is_delete = false);

-- -------------------------------------------------------------------------------------
-- 2. UNITS (20) — status campuran; beberapa STNK/KIR sengaja kedaluwarsa untuk uji penanda
-- -------------------------------------------------------------------------------------
WITH admin AS (
  SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
  WHERE r.user_type = 'admin' AND u.is_delete = false
  ORDER BY u.is_system, u.created_at LIMIT 1
)
INSERT INTO units (plate, unit_type_id, brand, year, last_odometer_km, status, stnk_expires_on, kir_expires_on, created_by, updated_by)
SELECT v.plate, t.id, v.brand, v.year, v.odo, v.status, v.stnk::date, v.kir::date, (SELECT id FROM admin), (SELECT id FROM admin)
FROM (VALUES
  ('B 9001 TRK', 'CDD_BAK',         'Mitsubishi', 2021,  85400, 'active',      '2027-03-15', '2027-01-10'),
  ('B 9002 TRK', 'CDD_BOX',         'Mitsubishi', 2022,  62150, 'active',      '2027-05-20', '2026-12-05'),
  ('B 9003 TRK', 'CDD_LONG',        'Hino',       2020, 120330, 'active',      '2026-12-01', '2027-02-14'),
  ('B 9004 TRK', 'FUSO_BAK',        'Mitsubishi', 2019, 198700, 'maintenance', '2027-04-11', '2026-10-30'),
  ('B 9005 TRK', 'FUSO_BOX',        'Mitsubishi', 2023,  40210, 'active',      '2028-01-22', '2027-07-01'),
  ('B 9006 TRK', 'TRONTON',         'Hino',       2018, 254300, 'active',      '2026-11-01', '2027-03-03'),
  ('B 9007 TRK', 'WINGBOX',         'Hino',       2022,  97800, 'active',      '2027-08-08', '2027-02-02'),
  ('B 9008 TRK', 'TRAILER',         'Volvo',      2020, 310500, 'active',      '2027-06-30', '2026-12-20'),
  ('B 9009 TRK', 'PICKUP',          'Suzuki',     2023,  30120, 'active',      '2028-02-17', '2027-08-17'),
  ('B 9010 TRK', 'PICKUP_BOX',      'Daihatsu',   2024,  15400, 'active',      '2029-01-05', '2027-07-05'),
  ('B 9011 TRK', 'BLIND_VAN',       'Daihatsu',   2021,  72300, 'inactive',    '2026-09-09', '2026-09-09'),
  ('B 9012 TRK', 'CDE_BAK',         'Isuzu',      2020, 140800, 'active',      '2027-04-04', '2027-01-25'),
  ('B 9013 TRK', 'CDE_BOX',         'Isuzu',      2022,  66900, 'active',      '2027-10-10', '2027-04-10'),
  ('B 9014 TRK', 'CDD_REEFER',      'Isuzu',      2023,  45600, 'active',      '2028-03-03', '2027-03-03'),
  ('B 9015 TRK', 'FUSO_LONG',       'Mitsubishi', 2021, 133000, 'maintenance', '2027-09-19', '2026-11-20'),
  ('B 9016 TRK', 'TRONTON_WINGBOX', 'Hino',       2024,  21000, 'active',      '2029-05-25', '2027-05-25'),
  ('D 8017 TRK', 'TRINTIN',         'UD Trucks',  2019, 280400, 'active',      '2027-02-28', '2027-02-28'),
  ('D 8018 TRK', 'TRAILER_40FT',    'Scania',     2022, 175250, 'active',      '2027-12-12', '2027-06-12'),
  ('L 7019 TRK', 'TANKI_8KL',       'Hino',       2020, 160700, 'active',      '2026-10-15', '2027-01-15'),
  ('H 6020 TRK', 'DUMP_TRUCK',      'Isuzu',      2017, 302900, 'inactive',    '2026-08-01', '2026-08-01')
) AS v(plate, type_code, brand, year, odo, status, stnk, kir)
JOIN unit_types t ON t.code = v.type_code AND t.is_delete = false
WHERE NOT EXISTS (
  SELECT 1 FROM units u WHERE upper(replace(u.plate, ' ', '')) = upper(replace(v.plate, ' ', '')) AND u.is_delete = false
);

-- -------------------------------------------------------------------------------------
-- 3. CUSTOMERS (20) — email huruf kecil sesuai aturan API
-- -------------------------------------------------------------------------------------
WITH admin AS (
  SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
  WHERE r.user_type = 'admin' AND u.is_delete = false
  ORDER BY u.is_system, u.created_at LIMIT 1
)
INSERT INTO customers (code, name, phone, email, created_by, updated_by)
SELECT v.code, v.name, v.phone, v.email, (SELECT id FROM admin), (SELECT id FROM admin)
FROM (VALUES
  ('CUST-101', 'PT Sinar Abadi Makmur',        '021-5550101', 'logistik@sinarabadi.co.id'),
  ('CUST-102', 'PT Maju Bersama Sentosa',      '021-5550102', 'gudang@majubersama.co.id'),
  ('CUST-103', 'PT Indo Pangan Lestari',       '021-5550103', 'order@indopangan.co.id'),
  ('CUST-104', 'CV Karya Mandiri Utama',       '0812-3000-104', 'karyamandiri@gmail.com'),
  ('CUST-105', 'PT Nusantara Retail Prima',    '021-5550105', 'dc@nusantararetail.co.id'),
  ('CUST-106', 'PT Bumi Semen Perkasa',        '021-5550106', 'pengiriman@bumisemen.co.id'),
  ('CUST-107', 'PT Segar Dingin Logistik',     '021-5550107', 'ops@segardingin.co.id'),
  ('CUST-108', 'Toko Bangunan Sumber Rejeki',  '0813-3000-108', NULL),
  ('CUST-109', 'PT Cahaya Elektronik Indonesia','021-5550109', 'warehouse@cahayaelektronik.co.id'),
  ('CUST-110', 'PT Farmasi Sehat Sejahtera',   '021-5550110', 'distribusi@farmasisehat.co.id'),
  ('CUST-111', 'PT Tekstil Jaya Bandung',      '022-5550111', 'ppic@tekstiljaya.co.id'),
  ('CUST-112', 'PT Baja Ringan Nusantara',     '021-5550112', 'sales@bajaringan.co.id'),
  ('CUST-113', 'CV Agro Tani Makmur',          '0815-3000-113', 'agrotani@yahoo.com'),
  ('CUST-114', 'PT Minuman Segar Abadi',       '021-5550114', 'logistic@minumansegar.co.id'),
  ('CUST-115', 'PT Kertas Putih Indah',        '021-5550115', 'gudang@kertasputih.co.id'),
  ('CUST-116', 'PT Otomotif Suku Cadang Raya', '021-5550116', 'parts@otoraya.co.id'),
  ('CUST-117', 'PT Kimia Industri Mulia',      '031-5550117', 'shipping@kimiamulia.co.id'),
  ('CUST-118', 'PT Furnitur Kayu Jepara',      '0291-555118', 'order@furniturjepara.co.id'),
  ('CUST-119', 'PT Distribusi Sembako Jaya',   '024-5550119', 'admin@sembakojaya.co.id'),
  ('CUST-120', 'PT Plastik Kemasan Sentral',   '021-5550120', NULL)
) AS v(code, name, phone, email)
WHERE NOT EXISTS (SELECT 1 FROM customers c WHERE c.code = v.code AND c.is_delete = false);

-- -------------------------------------------------------------------------------------
-- 4. LOCATIONS (26) — 4 warehouse + 2 depot (tanpa customer) + 20 customer_site (1 per customer)
-- -------------------------------------------------------------------------------------
WITH admin AS (
  SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
  WHERE r.user_type = 'admin' AND u.is_delete = false
  ORDER BY u.is_system, u.created_at LIMIT 1
)
INSERT INTO locations (customer_id, type, name, address, city, lat, lng, geofence_radius_m, operating_hours, pic_name, pic_phone, created_by, updated_by)
SELECT c.id, v.type, v.name, v.address, v.city, v.lat, v.lng, v.radius, v.hours, v.pic_name, v.pic_phone, (SELECT id FROM admin), (SELECT id FROM admin)
FROM (VALUES
  -- Gudang & depot sendiri (customer_code NULL)
  (NULL,       'warehouse',     'Gudang Pulogadung',            'Kawasan Industri Pulogadung Blok C No. 12',      'Jakarta Timur',  -6.192300::numeric, 106.906800::numeric, 200, '07:00-19:00', 'Budi Santoso',    '0811-4000-001'),
  (NULL,       'warehouse',     'Gudang Marunda',               'Jl. Marunda Makmur No. 8, Cilincing',            'Jakarta Utara',  -6.104500, 106.958900, 250, '07:00-20:00', 'Agus Pratama',    '0811-4000-002'),
  (NULL,       'warehouse',     'Gudang Cikarang',              'Kawasan Jababeka II Blok D No. 5',               'Bekasi',         -6.300100, 107.163200, 300, '06:00-22:00', 'Rina Wulandari',  '0811-4000-003'),
  (NULL,       'warehouse',     'Gudang Surabaya Rungkut',      'SIER Rungkut Jl. Rungkut Industri III No. 20',   'Surabaya',       -7.330900, 112.761500, 200, '08:00-17:00', 'Hendra Wijaya',   '0811-4000-004'),
  (NULL,       'depot',         'Depot Cibitung',               'Jl. Raya Teuku Umar No. 45, Cibitung',           'Bekasi',         -6.255700, 107.084100, 150, '00:00-23:59', 'Dedi Kurniawan',  '0811-4000-005'),
  (NULL,       'depot',         'Depot Tangerang',              'Jl. Raya Serang Km 12, Bitung',                  'Tangerang',      -6.214800, 106.555200, 150, '00:00-23:59', 'Yusuf Hidayat',   '0811-4000-006'),
  -- Lokasi tujuan customer
  ('CUST-101', 'customer_site', 'DC Sinar Abadi Cakung',        'Jl. Raya Bekasi Km 22, Cakung',                  'Jakarta Timur',  -6.183400, 106.948200, 200, '08:00-17:00', 'Andi Saputra',    '0812-5000-101'),
  ('CUST-102', 'customer_site', 'Gudang Maju Bersama Bogor',    'Jl. Raya Jakarta-Bogor Km 47, Cibinong',         'Bogor',          -6.481700, 106.854000, 200, '08:00-16:00', 'Siti Aminah',     '0812-5000-102'),
  ('CUST-103', 'customer_site', 'Pabrik Indo Pangan Karawang',  'KIIC Jl. Permata Raya Lot C-1',                  'Karawang',       -6.361200, 107.300400, 300, '07:00-19:00', 'Joko Susilo',     '0812-5000-103'),
  ('CUST-104', 'customer_site', 'Workshop Karya Mandiri',       'Jl. Pemuda No. 77, Rawamangun',                  'Jakarta Timur',  -6.195800, 106.889300, 100, '09:00-17:00', 'Fajar Nugroho',   '0812-5000-104'),
  ('CUST-105', 'customer_site', 'DC Nusantara Retail Serpong',  'Jl. Raya Serpong Km 8, Pakualam',                'Tangerang Selatan', -6.270500, 106.664100, 250, '06:00-22:00', 'Dewi Lestari',  '0812-5000-105'),
  ('CUST-106', 'customer_site', 'Proyek Bumi Semen Cileungsi',  'Jl. Raya Narogong Km 15, Cileungsi',             'Bogor',          -6.401200, 106.997300, 400, '07:00-17:00', 'Rudi Hartono',    '0812-5000-106'),
  ('CUST-107', 'customer_site', 'Cold Storage Segar Dingin',    'Jl. Muara Baru Ujung, Penjaringan',              'Jakarta Utara',  -6.104800, 106.794900, 150, '00:00-23:59', 'Lina Marlina',    '0812-5000-107'),
  ('CUST-108', 'customer_site', 'Toko Sumber Rejeki Depok',     'Jl. Margonda Raya No. 210',                      'Depok',          -6.381200, 106.832900, 100, '08:00-20:00', 'Pak Haji Rahmat', '0812-5000-108'),
  ('CUST-109', 'customer_site', 'Gudang Cahaya Elektronik',     'Jl. Daan Mogot Km 14, Cengkareng',               'Jakarta Barat',  -6.152300, 106.723800, 200, '08:00-17:00', 'Kevin Tanoto',    '0812-5000-109'),
  ('CUST-110', 'customer_site', 'DC Farmasi Sehat Pulogadung',  'Jl. Rawa Gelam IV No. 9, Pulogadung',            'Jakarta Timur',  -6.199100, 106.913500, 150, '08:00-17:00', 'Maya Sari',       '0812-5000-110'),
  ('CUST-111', 'customer_site', 'Pabrik Tekstil Jaya',          'Jl. Moh. Toha Km 6, Dayeuhkolot',                'Bandung',        -6.976700, 107.623100, 300, '07:00-15:00', 'Asep Sunandar',   '0812-5000-111'),
  ('CUST-112', 'customer_site', 'Gudang Baja Ringan Bekasi',    'Jl. Raya Narogong Km 7, Bantar Gebang',          'Bekasi',         -6.326400, 106.993200, 250, '08:00-17:00', 'Hadi Purnomo',    '0812-5000-112'),
  ('CUST-113', 'customer_site', 'Gudang Agro Tani Subang',      'Jl. Raya Pagaden No. 33',                        'Subang',         -6.452900, 107.775300, 300, '07:00-16:00', 'Ujang Hermawan',  '0812-5000-113'),
  ('CUST-114', 'customer_site', 'Pabrik Minuman Segar Bogor',   'Jl. Raya Ciawi No. 120',                         'Bogor',          -6.660100, 106.846700, 250, '06:00-18:00', 'Yanti Rahayu',    '0812-5000-114'),
  ('CUST-115', 'customer_site', 'Pabrik Kertas Putih Tangerang','Jl. Raya Serang Km 25, Balaraja',                'Tangerang',      -6.197800, 106.453600, 300, '07:00-19:00', 'Bambang Irawan',  '0812-5000-115'),
  ('CUST-116', 'customer_site', 'Gudang Otomotif Sunter',       'Jl. Danau Sunter Utara Blok G',                  'Jakarta Utara',  -6.141500, 106.869200, 150, '08:00-17:00', 'Eko Prasetyo',    '0812-5000-116'),
  ('CUST-117', 'customer_site', 'Pabrik Kimia Gresik',          'Kawasan Industri Gresik Jl. Tri Dharma No. 5',   'Gresik',         -7.157300, 112.648900, 400, '07:00-19:00', 'Suryadi',         '0812-5000-117'),
  ('CUST-118', 'customer_site', 'Showroom Furnitur Jepara',     'Jl. Raya Jepara-Kudus Km 4, Tahunan',            'Jepara',         -6.613200, 110.701500, 200, '08:00-17:00', 'Slamet Riyadi',   '0812-5000-118'),
  ('CUST-119', 'customer_site', 'Gudang Sembako Semarang',      'Kawasan Industri Terboyo Blok N No. 2',          'Semarang',       -6.952100, 110.468700, 250, '07:00-18:00', 'Wahyu Setiawan',  '0812-5000-119'),
  ('CUST-120', 'customer_site', 'Pabrik Plastik Kemasan',       'Jl. Industri Raya No. 18, Jatake',               'Tangerang',      NULL,      NULL,      200, NULL,          NULL,              NULL)
) AS v(customer_code, type, name, address, city, lat, lng, radius, hours, pic_name, pic_phone)
LEFT JOIN customers c ON c.code = v.customer_code AND c.is_delete = false
WHERE (v.customer_code IS NULL OR c.id IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM locations l WHERE l.name = v.name AND l.is_delete = false);

COMMIT;

-- Cek hasil
SELECT 'unit_types' AS master, count(*) FROM unit_types WHERE is_delete = false
UNION ALL SELECT 'units',     count(*) FROM units      WHERE is_delete = false
UNION ALL SELECT 'customers', count(*) FROM customers  WHERE is_delete = false
UNION ALL SELECT 'locations', count(*) FROM locations  WHERE is_delete = false;
