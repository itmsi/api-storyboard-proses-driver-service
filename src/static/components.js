/**
 * OpenAPI components: schema objek, response error, dan security.
 * Penamaan field mengikuti kontrak OGO Driver (snake_case).
 */
const { ex, ref } = require('./helpers')

const str = (example, extra = {}) => ({ type: 'string', example, ...extra })
const int = (example, extra = {}) => ({ type: 'integer', example, ...extra })
const num = (example, extra = {}) => ({ type: 'number', example, ...extra })
const bool = (example, extra = {}) => ({ type: 'boolean', example, ...extra })
const dt = (example = '2026-11-05T07:30:00+07:00', extra = {}) => ({
  type: 'string', format: 'date-time', example, ...extra,
})
const date = (example = '2026-11-05') => ({ type: 'string', format: 'date', example })
const arr = (items, extra = {}) => ({ type: 'array', items, ...extra })
const obj = (properties, required, extra = {}) => ({
  type: 'object', properties, ...(required && required.length ? { required } : {}), ...extra,
})
const nullable = (schema) => ({ ...schema, nullable: true })
const enumOf = (values, example = values[0], extra = {}) => ({
  type: 'string', enum: values, example, ...extra,
})

const MEDIA_KINDS = [
  'odometer_start', 'odometer_end', 'receipt', 'loading', 'delivery_note',
  'unloading', 'p2h_body', 'damage', 'location', 'signature', 'stamped_delivery_note',
]
const FUEL_LEVELS = ['empty', 'quarter', 'half', 'three_quarter', 'full']
const P2H_STATUS = ['belum', 'layak', 'catatan', 'tidak_layak']
const DO_STATUS = ['assigned', 'onhold', 'accepted', 'loading', 'in_transit', 'handover', 'completed', 'cancelled']
const DELIVERY_STATUS = ['terkirim_lengkap', 'terkirim_catatan', 'gagal_kirim']
const NEXT_STEP = ['loading', 'odometer_start', 'in_transit', 'handover', 'odometer_end', 'complete']
const EXPENSE_CATEGORY = ['bbm', 'tol', 'parkir', 'lainnya']
const SYNC_STATE = ['pending', 'sent', 'failed']

const clientRef = str('c1b7c7e2-4f0a-4d2b-9a51-3b6f2d1a8e10', {
  format: 'uuid',
  description: 'UUID buatan aplikasi untuk idempotensi. Request ulang dengan client_ref sama tidak membuat data ganda.',
})
// Blok audit standar: ada di setiap resource yang disimpan di database
const person = nullable(obj({ id: str('e49366b5-7565-4723-8763-3c32177a4038'), name: nullable(str('Admin Perusahaan')) }))
const auditProps = {
  created_at: dt('2026-11-05T07:00:00+07:00'),
  created_by: { ...person, description: 'Pembuat data (null jika dibuat sistem)' },
  updated_at: dt('2026-11-05T07:29:00+07:00'),
  updated_by: { ...person, description: 'Pengubah terakhir (null jika sistem)' },
}

const money = (example) => int(example, { description: 'Rupiah (IDR), bilangan bulat tanpa desimal' })

const schemas = {
  // ---------- Envelope ----------
  Error: obj({
    success: bool(false),
    error: obj({
      code: str('UNAUTHORIZED', { description: 'Kode error stabil, dipakai aplikasi untuk menentukan aksi' }),
      message: str('Sesi berakhir, silakan masuk lagi.', { description: 'Pesan siap tampil, mengikuti Accept-Language' }),
      http_status: int(401),
      details: {
        description: 'Info tambahan. Object untuk error bisnis, array {field,message} untuk VALIDATION_ERROR.',
        oneOf: [{ type: 'object', additionalProperties: true }, arr(ref('ValidationIssue'))],
      },
    }, ['code', 'message', 'http_status']),
  }, ['success', 'error']),
  ValidationIssue: obj({
    field: str('reason'),
    message: str('Alasan koreksi wajib diisi jika ada nilai yang dikoreksi.'),
  }, ['field', 'message']),

  // ---------- Umum ----------
  Gps: obj({
    lat: num(-6.18, { minimum: -90, maximum: 90 }),
    lng: num(106.94, { minimum: -180, maximum: 180 }),
    accuracy_m: num(8, { minimum: 0, description: 'Akurasi GPS (meter)' }),
  }, ['lat', 'lng']),
  DriverRef: obj({
    id: str('952975ba-bcf9-4a57-ac3b-be20940d8b25'), code: str('DRV-0021'), name: str('Andi'), phone: str('[NO_HP]'),
  }, ['id', 'code', 'name']),
  UnitRef: obj({ id: str('fc06e493-e9c6-429b-9529-bc07084818ee'), plate: str('B 9123 KZ'), type: str('CDD Bak') }, ['id', 'plate']),
  AiCheckRequest: obj({
    regenerate: bool(true, { description: 'true = baca ulang foto yang hasilnya sudah ada (selesai). Yang gagal selalu diantrekan ulang tanpa perlu diisi; yang sedang antre/berjalan tidak digandakan. Kosong atau false = tidak membaca ulang' }),
  }, undefined, { description: 'Badan opsional; boleh dikosongkan' }),
  AiCheck: obj({
    id: str('0c9d1e52-7a34-4b86-9d10-2f5e8a3b6c71', { description: 'Id pengecekan, dipakai untuk memantau lewat GET /ai-checks/{id}' }),
    media_id: str('fc06e493-e9c6-429b-9529-bc07084818ee'),
    kind: enumOf(['dashboard', 'receipt'], 'dashboard', { description: 'dashboard = foto odometer/bahan bakar; receipt = struk BBM. Diturunkan dari jenis foto' }),
    status: enumOf(['queued', 'processing', 'done', 'failed'], 'queued'),
    attempts: int(0),
    result: nullable(obj({}, undefined, {
      description: 'Hanya ada bila status done. dashboard: { km, fuel_level, confidence }. receipt: { total, liters, price_per_liter, fuel_type, merchant, date, time, confidence }. Nilai yang tidak terbaca = null',
      additionalProperties: true,
    })),
    confidence: nullable(num(0.93)),
    model: nullable(str('gpt-4o-mini')),
    error: nullable(obj({ code: str('ai_unavailable'), message: str('OpenAI sedang bermasalah (HTTP 503).') }, undefined, { description: 'Hanya ada bila status failed. Driver tetap bisa mengisi nilai sendiri' })),
    requested_at: dt(),
    finished_at: nullable(dt()),
  }),
  Media: obj({
    id: str('c6c62ddb-ea60-4bb7-9d99-deeb455f5e75'),
    kind: enumOf(MEDIA_KINDS, 'odometer_start'),
    url: str('https://cdn.example.com/media/c6c62ddb-ea60-4bb7-9d99-deeb455f5e75.jpg', { format: 'uri' }),
    thumb_url: str('https://cdn.example.com/media/c6c62ddb-ea60-4bb7-9d99-deeb455f5e75_thumb.jpg', { format: 'uri' }),
    source: enumOf(['camera'], 'camera', { description: 'Hanya kamera aplikasi; galeri ditolak' }),
    captured_at: dt('2026-11-05T13:50:00+07:00', { description: 'Waktu foto di HP' }),
    server_received_at: dt('2026-11-05T13:50:00+07:00'),
    gps: ref('Gps'),
    captured_by: str('952975ba-bcf9-4a57-ac3b-be20940d8b25'),
    sha256: str('<sha256-hash>', { description: 'Hash file, untuk deteksi foto/struk dipakai ulang' }),
    side: { ...enumOf(['depan', 'kanan', 'kiri', 'belakang']), description: 'Hanya untuk kind p2h_body' },
    ...auditProps,
  }, ['id', 'kind', 'url', 'captured_at']),

  // ---------- Umum ----------
  AuditFields: obj(auditProps),

  // ---------- Internal (saas-worker) ----------
  MigrationResult: obj({
    schema_version: nullable(str('20261110001500_system_user', { description: 'Nama file migrasi terakhir yang sudah jalan, tanpa .js' })),
    applied: arr(str('20261110001500_system_user'), { description: 'Migrasi yang baru dijalankan; kosong jika sudah terbaru' }),
    duration_ms: int(840),
  }),
  SeedResult: obj({
    seeded: arr(str('system_user:created'), { description: 'Yang disiapkan: default_roles, setting:<kunci> (pengaturan bawaan yang baru dibuat, mis. setting:document_prefix), system_user:created | system_user:updated' }),
    duration_ms: int(120),
  }),
  VerifyResult: obj({
    ok: bool(true),
    schema_version: nullable(str('20261110001500_system_user')),
    checks: obj({
      app_role_login: bool(true, { description: 'Role app bisa login' }),
      migrations_up_to_date: bool(true),
      tables: bool(true, { description: 'Semua tabel inti ada' }),
      system_user: {
        type: 'boolean', nullable: true, example: true, description: 'null jika client tidak punya system user'
      },
    }),
  }),
  MigrationCatalog: obj({
    latest_version: nullable(str('20261110001500_system_user')),
    count: int(16),
    migrations: arr(str('20261110000000_init_extensions')),
  }),
  // ---------- App ----------
  PublicConfig: obj({
    languages: arr(str('id'), { example: ['id', 'en', 'zh'] }),
    default_language: str('id'),
    min_app_version: str('1.0.0'),
    latest_app_version: str('1.0.0'),
    update_url: nullable(str('https://play.google.com/store/apps/details?id=<package>')),
    maintenance: obj({ active: bool(false), message: nullable(str(null)) }),
    support: obj({ label: str('Hubungi admin'), phone: nullable(str('[NO_HP_ADMIN]')) }),
  }),
  AppConfig: obj({
    config_version: str('2026-11-01.1', { description: 'Simpan di HP; jika beda dengan bootstrap, ambil ulang /config' }),
    client_id: str('cl_acme'),
    client_code: str('ACME', { description: 'Client code yang dipakai login' }),
    client_name: str('PT Contoh Logistik'),
    languages: arr(str('id')),
    default_language: str('id'),
    modules: obj({
      route_tracking: bool(false),
      receipt_ocr: bool(true),
      odometer_ocr: bool(true),
      travel_allowance: bool(true),
      incident_report: bool(false),
    }),
    photo_rules: obj({
      loading: obj({ min: int(2), max: int(10) }),
      unloading: obj({ min: int(1), max: int(10) }),
      delivery_note_pages: obj({ min: int(1), max: int(5) }),
      p2h_body: obj({ required_sides: arr(str('depan'), { example: ['depan', 'kanan', 'kiri', 'belakang'] }) }),
    }),
    expense_categories: arr(obj({
      code: enumOf(EXPENSE_CATEGORY),
      label: str('BBM'),
      input: enumOf(['receipt_ocr', 'manual']),
      description_required: bool(true),
    })),
    correction_reason_required: bool(true),
    p2h: obj({ frequency: str('daily_per_unit'), valid_until_local: str('23:59') }),
    branding: obj({
      app_name: nullable(str('Logistik Maju', { description: 'Nama aplikasi di dalam layar. Kosong = pakai client_name.' })),
      tagline: nullable(str('Antar Tepat Waktu')),
      logo_url: nullable(str('https://api.contoh.co.id/storage/branding/maju/logo.png', { format: 'uri', description: 'Logo (latar terang)' })),
      logo_dark_url: nullable(str('https://api.contoh.co.id/storage/branding/maju/logo-dark.png', { format: 'uri', description: 'Logo untuk tema gelap' })),
      icon_url: nullable(str('https://api.contoh.co.id/storage/branding/maju/icon.png', { format: 'uri', description: 'Ikon persegi' })),
      colors: obj({
        primary: str('#0B3C8C', { description: 'Format #RRGGBB, selalu huruf besar di respons' }),
        secondary: str('#6BB33B'),
        accent: str('#F5A623'),
        on_primary: str('#FFFFFF', { description: 'Warna teks/ikon di atas warna primer' }),
      }),
      support: obj({ label: str('Hubungi admin'), phone: nullable(str('0812-3456-7890')) }),
    }, undefined, { description: 'Tampilan merek perusahaan ini; aplikasi membacanya saat berjalan (warna dan logo), jadi tidak perlu rilis aplikasi baru.' }),
  }),
  Bootstrap: obj({
    server_time: dt(),
    config_version: str('2026-11-01.1'),
    driver: ref('DriverRef'),
    unit_today: nullable(ref('UnitRef')),
    p2h_today: nullable(obj({
      status: enumOf(P2H_STATUS), p2h_id: str('d6c681e9-d765-40c1-9b35-f8ad7f695743'), recheck_requested: bool(true),
    }, ['status'], { description: 'null jika driver belum punya unit hari ini' })),
    assigned_do_count: int(1),
    active_do_id: nullable(str('2fb9f57e-a6e7-4890-b957-30261a15b471')),
    pending_sync: obj({ count: int(2), oldest_client_created_at: dt('2026-11-05T06:58:00+07:00') }),
    next_screen: enumOf(['P2H', 'DO_ASSIGNED', 'DO_ACTIVE'], 'P2H', {
      description: 'Layar yang dibuka aplikasi setelah splash. DO_ACTIVE jika ada DO berjalan; P2H jika unit hari ini belum di-P2H (belum / diminta ulang / tidak layak); selain itu DO_ASSIGNED.',
    }),
  }),

  // ---------- Auth ----------
  Device: obj({
    device_id: str('android-7f3a'), app_version: str('1.0.0'), os: str('Android 14'),
  }, ['device_id']),
  LoginRequest: obj({
    client_code: str('ACME', {
      description: 'Kode perusahaan (client). Menentukan database yang dipakai; huruf besar/kecil tidak dibedakan.',
    }),
    username: str('DRV-0021', { description: 'Driver: ID driver atau No. HP (08…, 628…, +628…). Admin: username atau email. Peran dibaca dari akunnya.' }),
    password: str('<password>', { format: 'password' }),
    device: { ...ref('Device'), description: 'Wajib untuk driver (aplikasi HP); tidak dipakai untuk admin' },
    remember_me: bool(true),
  }, ['client_code', 'username', 'password']),
  TokenPair: obj({
    access_token: str('<jwt>'),
    refresh_token: str('<refresh>', { description: 'Dirotasi setiap refresh; token lama langsung tidak berlaku' }),
    expires_in: int(86400, { description: 'Umur access token (detik)' }),
  }, ['access_token', 'refresh_token', 'expires_in']),
  LoginResponse: {
    description: 'Pasangan token + data akun. Driver mendapat `driver`, admin mendapat `admin`.',
    allOf: [ref('TokenPair'), {
      oneOf: [
        obj({
          driver: {
            allOf: [ref('DriverRef'), obj({
              role: nullable(obj({ id: str('4c7e9b21-8d35-4a60-b1f2-6e0a3d5c8f17'), name: str('Driver'), is_system: bool(true) })),
              permissions: obj({}, [], { description: 'Hak akses dari role driver: { <modul driver_*>: [aksi] }', additionalProperties: { type: 'array', items: enumOf(['read', 'create', 'update', 'delete', 'approve', 'recheck', 'reset_password']) }, example: { driver_profile: ['read', 'update'], driver_p2h: ['read', 'create'] } }),
            })],
          },
        }),
        obj({
          admin: obj({
            id: str('4f1a8c52-9d3e-4b7a-8e61-2c5d7f90a1b3'),
            username: str('budi.admin'),
            name: str('Budi Admin'),
            email: str('budi@contoh.co.id'),
            role: nullable(obj({ id: str('9a1c3e55-2b7d-4f80-b6a4-1d5e8c7f2a90'), name: str('Staf Operasional'), is_system: bool(false) })),
            permissions: obj({}, [], { description: 'Hak akses dari role: { <modul>: [read, create, update, delete] }', additionalProperties: { type: 'array', items: enumOf(['read', 'create', 'update', 'delete', 'approve', 'recheck', 'reset_password']) }, example: { units: ['read', 'update'] } }),
          }),
        }),
      ],
    }],
  },
  RefreshRequest: obj({ refresh_token: str('<refresh>') }, ['refresh_token']),
  LogoutResponse: obj({
    logged_out: bool(true),
    pending_sync_warning: bool(false, { description: 'true jika server tahu masih ada data offline yang belum terkirim' }),
  }),
  Me: obj({
    id: str('952975ba-bcf9-4a57-ac3b-be20940d8b25'),
    code: str('DRV-0021'),
    name: str('Andi'),
    phone: str('[NO_HP]'),
    unit_today: nullable(ref('UnitRef')),
    role: nullable(obj({ id: str('4c7e9b21-8d35-4a60-b1f2-6e0a3d5c8f17'), name: str('Driver'), is_system: bool(true) })),
    permissions: obj({}, [], { description: 'Hak akses dari role driver: { <modul driver_*>: [aksi] }. Aplikasi boleh menyembunyikan fitur yang tidak diizinkan; server tetap memeriksa di setiap request.', additionalProperties: { type: 'array', items: enumOf(['read', 'create', 'update', 'delete', 'approve', 'recheck', 'reset_password']) }, example: { driver_profile: ['read', 'update'] } }),
    settings: obj({ language: enumOf(['id', 'en', 'zh']) }),
    app: obj({ version: str('1.0.0') }),
    sync: obj({ pending: int(0), last_synced_at: nullable(dt('2026-11-05T07:29:00+07:00')) }),
    ...auditProps,
  }),
  SettingsRequest: obj({ language: enumOf(['id', 'en', 'zh'], 'en') }, ['language']),
  PushTokenRequest: obj({ device_id: str('android-7f3a'), fcm_token: str('<fcm-token>') }, ['device_id', 'fcm_token']),
  PushTokenResponse: obj({
    registered: bool(true), topics: arr(str('do_assigned'), { example: ['do_assigned', 'p2h_recheck_requested'] }),
  }),

  // ---------- Media ----------
  MediaUploadRequest: obj({
    file: { type: 'string', format: 'binary', description: 'JPG/PNG dari kamera aplikasi' },
    kind: enumOf(MEDIA_KINDS, 'odometer_start'),
    client_ref: clientRef,
    captured_at: dt('2026-11-05T13:50:00+07:00'),
    gps: str('{"lat":-6.18,"lng":106.94,"accuracy_m":8}', { description: 'JSON string berisi Gps' }),
    // Tanpa contoh/nilai bawaan: Swagger mengisi contoh ke formulir dan ikut mengirimnya, padahal side HANYA boleh untuk kind = p2h_body (selain itu 422 "side is not allowed")
    side: { type: 'string', enum: ['depan', 'kanan', 'kiri', 'belakang'], description: 'Isi HANYA jika kind = p2h_body (wajib untuk jenis itu); untuk jenis lain biarkan kosong (teks kosong dari formulir dianggap tidak dikirim). Mengisinya untuk jenis lain ditolak 422' },
  }, ['file', 'kind', 'client_ref', 'captured_at']),

  // ---------- P2H ----------
  P2HTemplate: obj({
    items: arr(obj({ code: str('ban'), label: str('Ban'), hint: str('Tekanan dan kondisi tapak') })),
    body_photo_sides: arr(str('depan'), { example: ['depan', 'kanan', 'kiri', 'belakang'] }),
  }),
  P2HItemResult: obj({
    code: str('lampu'),
    label: str('Lampu'),
    result: enumOf(['sesuai', 'tidak_sesuai']),
    description: str('Lampu sein kiri mati', { description: 'Wajib jika result = tidak_sesuai' }),
  }, ['code', 'result']),
  P2HInspection: obj({
    id: str('d6c681e9-d765-40c1-9b35-f8ad7f695743'),
    unit: ref('UnitRef'),
    date: date(),
    status: enumOf(P2H_STATUS, 'catatan'),
    can_operate: bool(true),
    checked_by: obj({ id: str('c50b88db-1230-4b7c-9750-c6ee5687f32c'), name: str('Budi') }),
    checked_at: dt('2026-11-05T06:10:00+07:00'),
    location: obj({ name: nullable(str('Depot Cakung')), gps: ref('Gps') }),
    items: arr(ref('P2HItemResult')),
    body_photos: arr(ref('Media')),
    admin_confirmed_by_driver: nullable(bool(true)),
    valid_until: dt('2026-11-05T23:59:00+07:00'),
    ...auditProps,
  }),
  P2HToday: {
    description: 'Status P2H unit hari ini. status=belum -> p2h null (dan recheck_requested bila admin minta ulang). Status lain -> object P2HInspection.',
    oneOf: [
      obj({
        unit: ref('UnitRef'),
        date: date(),
        status: enumOf(['belum']),
        p2h: nullable(obj({})),
        recheck_requested: bool(true),
        previous: obj({
          id: str('d6c681e9-d765-40c1-9b35-f8ad7f695743'), status: enumOf(P2H_STATUS, 'catatan'), checked_by: str('Budi'), checked_at: dt(),
        }),
      }),
      ref('P2HInspection'),
    ],
  },
  P2HSubmitRequest: obj({
    client_ref: clientRef,
    checked_at: dt('2026-11-05T06:10:00+07:00'),
    gps: ref('Gps'),
    items: arr(obj({
      code: str('lampu'), result: enumOf(['sesuai', 'tidak_sesuai']), description: str('Lampu sein kiri mati'),
    }, ['code', 'result'])),
    body_photo_ids: obj({
      depan: str('2da8120e-5cf5-463e-817b-c5f58345b30f'), kanan: str('8dbcd49c-3409-4ffa-a79d-08b13e59634a'), kiri: str('de9dd961-0e38-4fbb-9d16-5fe3a4158e64'), belakang: str('be07aabf-a229-4cdb-8e0e-79c3f6c6b033'),
    }, ['depan', 'kanan', 'kiri', 'belakang']),
    admin_confirmed_by_driver: bool(true, { description: 'Driver menyatakan sudah lapor admin (wajib jika ada item tidak_sesuai)' }),
  }, ['client_ref', 'checked_at', 'gps', 'items', 'body_photo_ids']),
  P2HSubmitResponse: obj({
    id: str('d6c681e9-d765-40c1-9b35-f8ad7f695743'),
    status: enumOf(P2H_STATUS, 'catatan'),
    can_operate: bool(true),
    valid_until: dt('2026-11-05T23:59:00+07:00'),
  }),

  // ---------- Delivery Order ----------
  // ---------- Muatan DO ----------
  CargoDetail: obj({
    label: str('No container', { maxLength: 100 }),
    value: str('234242', { maxLength: 500, description: 'Teks; angka yang dikirim disimpan sebagai teks' }),
  }, ['label', 'value']),
  CargoType: nullable(str('Container', { description: 'Jenis muatan (teks bebas); null bila tidak diisi' })),
  CargoDetails: arr(ref('CargoDetail'), {
    description: 'Rincian muatan, urut sesuai input. Selalu array (kosong bila tidak diisi).',
    example: [
      { label: 'No container', value: '234242' },
      { label: 'No seal', value: '234234' },
      { label: 'Keterangan', value: 'Barang mudah pecah' },
    ],
  }),
  CargoTypeInput: nullable(str('Container', { maxLength: 100, description: 'Opsional. "" atau null = dikosongkan' })),
  CargoDetailsInput: nullable(arr(ref('CargoDetail'), {
    maxItems: 50,
    description: 'Opsional. Rincian bebas berupa pasangan label dan value (maks. 50). null atau [] = tanpa rincian.',
    example: [
      { label: 'No container', value: '234242' },
      { label: 'No seal', value: '234234' },
      { label: 'Keterangan', value: 'Barang mudah pecah' },
    ],
  })),
  DeliveryOrder: obj({
    id: str('2fb9f57e-a6e7-4890-b957-30261a15b471'),
    no: str('DO-0144'),
    status: enumOf(DO_STATUS),
    assigned_at: dt('2026-11-05T06:55:00+07:00'),
    assigned_by: str('f1b7c36a-1eae-4b3b-8ee4-9434fcfeff2f'),
    unit: ref('UnitRef'),
    driver: ref('DriverRef'),
    origin: obj({
      name: str('Gudang Cakung'), address: str('[ALAMAT GUDANG]'), gps: ref('Gps'), maps_url: nullable(str('https://maps.app.goo.gl/AbCdEf123', { description: 'Tautan Google Maps: maps_url lokasi bila diisi admin, kalau kosong dibuat dari koordinat, null bila koordinat juga kosong' })), load_time: dt('2026-11-05T13:00:00+07:00'),
    }),
    destination: obj({
      name: str('PT Contoh Jaya'),
      city: str('Karawang'),
      address: str('[ALAMAT LENGKAP TUJUAN]'),
      gps: ref('Gps'),
      operating_hours: str('08:00-17:00'),
      pic: obj({ name: str('[NAMA PIC]'), phone: str('[NO_HP_PIC]') }),
      maps_url: nullable(str('https://maps.google.com/?q=-6.30,107.29', { description: 'Tautan Google Maps: maps_url lokasi bila diisi admin, kalau kosong dibuat dari koordinat, null bila koordinat juga kosong' })),
    }),
    cargo_type: ref('CargoType'),
    cargo_details: ref('CargoDetails'),
    estimated_distance_km: num(70),
    travel_allowance: obj({
      amount: money(600000), currency: str('IDR'), received_confirmed: bool(false),
    }),
    p2h_today: obj({
      status: enumOf(P2H_STATUS, 'catatan'),
      checked_by: str('Budi'),
      checked_at: dt(),
      recheck_requested: bool(true, { description: 'Hanya ada jika status belum dan admin meminta P2H ulang' }),
    }, ['status'], { description: 'Hanya untuk DO berstatus assigned' }),
    can_accept: bool(true, { description: 'false jika P2H belum ada / unit tidak layak / masih ada DO berjalan / unit sedang dipakai DO lain (lihat unit_in_use_by). Hanya untuk DO assigned' }),
    unit_in_use_by: {
      type: 'object',
      description: 'Hanya ada jika unit DO ini sedang dipakai DO lain yang berjalan',
      properties: { delivery_order_no: { type: 'string', example: 'DO-0143' }, driver_name: { type: 'string', example: 'Budi Santoso' } },
    },
    ...auditProps,
  }),
  AcceptRequest: obj({
    client_ref: clientRef,
    accepted_at: dt('2026-11-05T07:32:00+07:00'),
    gps: ref('Gps'),
    travel_allowance_received: bool(true),
  }, ['client_ref', 'accepted_at', 'gps']),
  AcceptResponse: obj({
    id: str('2fb9f57e-a6e7-4890-b957-30261a15b471'),
    status: enumOf(DO_STATUS, 'accepted'),
    travel_allowance: obj({ amount: money(600000), received_confirmed: bool(true), confirmed_at: dt() }),
    next_step: enumOf(NEXT_STEP),
  }),

  // ---------- Loading ----------
  LoadingRequest: obj({
    client_ref: clientRef,
    loaded_at: dt('2026-11-05T13:06:00+07:00'),
    gps: ref('Gps'),
    cargo_photo_ids: arr(str('285f21fc-c60e-44fe-a019-2a71bda2424b'), { minItems: 2, maxItems: 10 }),
    quantity_matches_do: bool(true),
    quantity_note: nullable(str('Gudang hanya siapkan 3 palet, 1 palet menyusul', {
      description: 'Wajib jika quantity_matches_do = false',
    })),
    delivery_note_pages: arr(obj({ page: int(1), media_id: str('540c0a4e-0e55-4111-819b-7a1b43afeafd') }, ['page', 'media_id']), { minItems: 1, maxItems: 5 }),
  }, ['client_ref', 'loaded_at', 'gps', 'cargo_photo_ids', 'quantity_matches_do', 'delivery_note_pages']),
  LoadingResponse: obj({
    id: str('299c209e-2f21-484b-b328-f2dbfae18f4e'),
    delivery_order_id: str('2fb9f57e-a6e7-4890-b957-30261a15b471'),
    photo_count: int(3),
    photo_rule: obj({ min: int(2), max: int(10), satisfied: bool(true) }),
    next_step: enumOf(NEXT_STEP, 'odometer_start'),
  }),

  // ---------- Odometer ----------
  FuelLevel: enumOf(FUEL_LEVELS, 'half'),
  OdometerValue: obj({ km: int(45210), fuel_level: ref('FuelLevel') }),
  OdometerRequest: obj({
    client_ref: clientRef,
    type: enumOf(['start', 'end']),
    media_id: str('c6c62ddb-ea60-4bb7-9d99-deeb455f5e75'),
    ocr: ref('OdometerValue'),
    corrected: nullable(ref('OdometerValue')),
    correction_reason: nullable(str('Angka terakhir buram, OCR baca 0 seharusnya 6', {
      description: 'Wajib jika corrected diisi',
    })),
    captured_at: dt('2026-11-05T13:50:00+07:00'),
    gps: ref('Gps'),
  }, ['client_ref', 'type', 'media_id', 'captured_at', 'gps']),
  OdometerResponse: obj({
    id: str('29ca88d6-4787-4e65-b668-333896c80041'),
    type: enumOf(['start', 'end']),
    media: ref('Media'),
    ocr: ref('OdometerValue'),
    corrected: nullable(ref('OdometerValue')),
    effective: obj({ km: int(45210), fuel_level: ref('FuelLevel'), source: enumOf(['ocr', 'corrected']) }),
    next_step: enumOf(NEXT_STEP, 'in_transit'),
  }),

  // ---------- Expenses ----------
  ReceiptFields: obj({
    time: str('14:32'),
    fuel_type: str('Solar'),
    liters: num(30.0),
    price_per_liter: money(6300),
    total: money(204000),
  }),
  ExpenseBbmRequest: obj({
    client_ref: clientRef,
    category: enumOf(['bbm']),
    media_id: str('f97ceecd-7d4d-48ab-bd9f-ddb0e518b8fc'),
    ocr: ref('ReceiptFields'),
    corrected: nullable({ ...ref('ReceiptFields'), description: 'Hanya field yang dikoreksi' }),
    correction_reason: nullable(str('OCR salah baca harga, di struk tertulis 6.800')),
    captured_at: dt('2026-11-05T14:33:00+07:00'),
    gps: ref('Gps'),
  }, ['client_ref', 'category', 'media_id', 'ocr', 'captured_at']),
  ExpenseManualRequest: obj({
    client_ref: clientRef,
    category: enumOf(['tol', 'parkir', 'lainnya'], 'parkir'),
    amount: money(5000),
    description: str('Parkir rest area KM 57', { description: 'Wajib untuk kategori lainnya' }),
    proof_media_id: nullable(str('82766895-18fb-4659-a84b-1b58279fb73e')),
    recorded_at: dt('2026-11-05T15:10:00+07:00'),
    gps: ref('Gps'),
  }, ['client_ref', 'category', 'amount', 'recorded_at']),
  ExpenseBbmResponse: obj({
    id: str('bff89c85-7925-4a48-903d-436609daf0cf'),
    category: enumOf(['bbm']),
    amount: money(204000),
    ocr: ref('ReceiptFields'),
    corrected: nullable(ref('ReceiptFields')),
    effective: ref('ReceiptFields'),
    corrected_fields: arr(str('price_per_liter')),
    correction_reason: nullable(str('OCR salah baca harga, di struk tertulis 6.800')),
    checks: obj({
      liters_x_price_matches_total: bool(true),
      receipt_time_within_do: bool(true),
      receipt_not_used_before: bool(true),
    }),
    media: ref('Media'),
  }),
  ExpenseManualResponse: obj({
    id: str('2056d3fc-36ca-4f04-ac84-b6df4da91296'),
    category: enumOf(EXPENSE_CATEGORY, 'parkir'),
    amount: money(5000),
    description: str('Parkir rest area KM 57'),
    has_proof: bool(false),
    recorded_at: dt('2026-11-05T15:10:00+07:00'),
    gps: ref('Gps'),
  }),
  ExpenseListItem: obj({
    id: str('bff89c85-7925-4a48-903d-436609daf0cf'),
    category: enumOf(EXPENSE_CATEGORY),
    label: str('Solar 30 L'),
    amount: money(204000),
    has_proof: bool(true),
    corrected: bool(true),
    recorded_at: dt('2026-11-05T14:33:00+07:00'),
    sync: enumOf(SYNC_STATE, 'sent'),
  }),
  ExpenseListMeta: obj({ total: money(263500), travel_allowance: money(600000), remaining: money(336500) }),

  // ---------- Handover ----------
  Receiver: obj({
    name: str('[NAMA PENERIMA]'),
    signature_media_id: str('0ced184c-70cd-469c-b468-6514ee145ae5'),
    signed_at: dt('2026-11-05T16:52:00+07:00'),
    acknowledges_issues: bool(true, { description: 'Untuk condition = masalah' }),
  }, ['name', 'signature_media_id', 'signed_at']),
  HandoverRequest: obj({
    client_ref: clientRef,
    condition: enumOf(['lengkap', 'masalah', 'gagal_kirim']),
    unloading_photo_ids: arr(str('2cdfeee1-0f8d-461a-802c-bd6faf452615'), { description: 'Wajib untuk lengkap / masalah' }),
    stamped_delivery_note_ids: arr(str('9ae990be-7834-4e70-8cda-d58fa147b377'), { description: 'Wajib untuk lengkap / masalah' }),
    receiver: nullable(ref('Receiver')),
    issues: arr(obj({
      type: enumOf(['rusak', 'kurang', 'salah_kirim', 'lainnya'], 'rusak'),
      quantity: num(1),
      unit: str('palet'),
      photo_ids: arr(str('c78ff07d-4d86-4778-b4cd-376d035075d7')),
    }), { description: 'Wajib untuk condition = masalah' }),
    received_quantity: num(3, { description: 'Untuk condition = masalah' }),
    failure_reason: enumOf(['penerima_tidak_ada', 'alamat_tidak_ditemukan', 'ditolak_penerima', 'lainnya'], 'penerima_tidak_ada', {
      description: 'Wajib untuk condition = gagal_kirim',
    }),
    location_photo_ids: arr(str('2cd20058-4e35-40e6-9aa4-e770a6836571'), { description: 'Wajib untuk condition = gagal_kirim' }),
    note: nullable(str('Sudah menunggu 30 menit')),
    gps: ref('Gps'),
    recorded_at: dt('2026-11-05T16:50:00+07:00'),
  }, ['client_ref', 'condition', 'gps']),
  HandoverResponse: obj({
    id: str('e9c174a7-a937-4a36-992c-978f6fd48bf6'),
    condition: enumOf(['lengkap', 'masalah', 'gagal_kirim']),
    delivery_status: enumOf(DELIVERY_STATUS),
    next_step: enumOf(NEXT_STEP, 'odometer_end'),
  }),

  // ---------- Summary ----------
  Summary: obj({
    delivery_order_id: str('2fb9f57e-a6e7-4890-b957-30261a15b471'),
    no: str('DO-0144'),
    delivery_status: enumOf(DELIVERY_STATUS),
    odometer: obj({
      start: obj({ km: int(45210), source: enumOf(['ocr', 'corrected']) }),
      end: nullable(obj({ km: int(45278), source: enumOf(['ocr', 'corrected']) }), { description: 'null sebelum odometer akhir dicatat' }),
      distance_km: nullable(num(68)),
    }),
    duration_minutes: nullable(int(183, { description: 'Dari odometer awal sampai selesai (atau odometer akhir bila belum selesai)' })),
    expenses: arr(ref('ExpenseListItem')),
    expense_total: money(263500),
    travel_allowance: money(600000),
    settlement: obj({
      type: enumOf(['refund_to_company', 'payable_to_driver', 'balanced']),
      amount: money(336500),
      label: str('Sisa disetor'),
    }),
  }),
  CompleteRequest: obj({
    client_ref: clientRef, completed_at: dt('2026-11-05T16:56:00+07:00'), gps: ref('Gps'),
  }, ['client_ref', 'completed_at', 'gps']),
  CompleteResponse: obj({
    id: str('2fb9f57e-a6e7-4890-b957-30261a15b471'),
    status: enumOf(DO_STATUS, 'completed'),
    locked: bool(true),
    sync: enumOf(SYNC_STATE, 'sent'),
    completed_at: dt('2026-11-05T16:56:00+07:00'),
    message: str('DO selesai dicatat dan terkirim ke admin.'),
  }),

  // ---------- Active & History ----------
  ActiveDeliveryOrder: obj({
    id: str('2fb9f57e-a6e7-4890-b957-30261a15b471'),
    no: str('DO-0144'),
    route: str('Cakung → PT Contoh Jaya, Karawang'),
    status: enumOf(DO_STATUS, 'in_transit'),
    started_at: dt('2026-11-05T13:52:00+07:00'),
    odometer_start_km: int(45210),
    expense_total: money(263500),
    steps: arr(obj({
      code: enumOf(NEXT_STEP), label: str('Muat'), state: enumOf(['done', 'current', 'todo']),
    })),
  }),
  HistoryItem: obj({
    id: str('693d2472-b0ca-4705-a03b-45731c79f241'),
    no: str('DO-0139'),
    date: date('2026-11-04'),
    route: str('Cakung → Bekasi'),
    distance_km: num(41),
    unit_plate: str('B 9123 KZ'),
    expense_total: money(182000),
    delivery_status: enumOf(DELIVERY_STATUS),
    status: enumOf(['assigned', 'onhold', 'accepted', 'loading', 'in_transit', 'handover', 'completed', 'cancelled'], 'completed', { description: 'Status DO saat ini (riwayat memuat semua status, tidak menunggu selesai)' }),
    planned_load_at: nullable(dt()),
    assigned_at: nullable(dt()),
    accepted_at: nullable(dt()),
    started_at: nullable(dt()),
    completed_at: nullable(dt()),
    on_hold_at: nullable(dt(), { description: 'Hanya untuk admin' }),
    cancelled_at: nullable(dt()),
    driver: obj({ id: str('d84f2a61-7c93-4e05-a1b8-5f3e9c0d7a22'), code: str('DRV-0021'), name: str('Andi Pratama') }, undefined, { description: 'Hanya untuk admin' }),
  }),
  HistoryMeta: obj({
    from: date('2026-11-01'),
    to: date('2026-11-05'),
    limit: int(20),
    next_cursor: nullable(str('eyJpZCI6ImRvXzAxMzEifQ==')),
    has_more: bool(true),
    summary: obj({
      do_count: int(4),
      distance_km: num(167),
      expense_total: money(679500),
      by_status: {
        type: 'object', additionalProperties: { type: 'integer' }, example: { completed: 3, assigned: 1 }, description: 'Jumlah DO per status pada rentang dan filter yang sama',
      },
    }),
  }),

  // ---------- Sync ----------
  SyncBatchRequest: obj({
    device_id: str('android-7f3a'),
    items: arr(obj({
      client_ref: clientRef,
      method: enumOf(['POST', 'PUT']),
      path: str('/delivery-orders/<id-do>/expenses', { description: 'Path relatif terhadap /api/v1 (awalan /api/v1 boleh disertakan)' }),
      body: {
        type: 'object', additionalProperties: true, description: 'Body request asli. `client_ref` boleh dihilangkan (diisi dari item); jika ada harus sama dengan `client_ref` item.',
      },
      client_created_at: dt('2026-11-05T15:10:00+07:00'),
    }, ['client_ref', 'method', 'path', 'body', 'client_created_at']), { maxItems: 100 }),
  }, ['device_id', 'items']),
  SyncBatchResponse: obj({
    results: arr(obj({
      client_ref: clientRef,
      status: enumOf(['created', 'duplicate_ignored', 'failed']),
      id: nullable(str('5f0c2a9e-7d41-4b83-9e6a-1c8d3b4a5e70', { description: 'Id resource yang dibuat / yang sudah ada (duplicate_ignored)' })),
      error: obj({
        code: str('VALIDATION_ERROR'), message: str('Data tidak lengkap.'), http_status: int(422), details: { description: 'Rincian error (opsional)' },
      }, ['code', 'message', 'http_status'], { description: 'Hanya jika status = failed. Bentuknya sama dengan `error` di response error biasa.' }),
    })),
  }),

  // ---------- Dashboard ----------
  DashboardCount: obj({
    status: str('assigned'), label: str('Ditugaskan'), count: int(2), percent: int(29, { description: 'Persen dari total (dibulatkan)' }),
  }),
  Dashboard: obj({
    period: obj({
      start_date: date('2026-11-05'),
      end_date: date('2026-11-05'),
      days: int(1),
      generated_at: dt('2026-11-05T15:40:00+07:00', { description: 'Waktu data dihitung ("data per 15.40")' }),
    }),
    cards: obj({
      delivery_orders: obj({
        total: int(7, { description: 'DO pada rentang, tanpa DO batal' }),
        not_accepted: int(2, { description: 'Belum diterima driver (status assigned)' }),
        on_hold: int(0, { description: 'Ditahan admin' }),
      }),
      running: obj({
        total: int(2, { description: 'Diterima sampai serah terima (accepted, loading, in_transit, handover)' }),
        pending_sync: int(1, { description: 'Data dari HP yang masih gagal tersinkron (antre), milik DO yang belum selesai' }),
      }),
      completed: obj({
        total: int(2, { description: 'Selesai, selain gagal kirim' }),
        settled: int(1, { description: 'Rekap uang jalan yang sudah disetor/dibayar (disetujui)' }),
      }),
      failed: obj({
        total: int(1, { description: 'Selesai dengan hasil serah terima gagal_kirim' }),
        needs_reschedule: bool(true, { description: 'true bila ada DO gagal kirim yang belum dijadwalkan ulang' }),
        needs_reschedule_count: int(1, { description: 'Jumlah DO gagal kirim di rentang yang belum dijadwalkan ulang (POST /delivery-orders/{id}/reschedule)' }),
      }),
    }),
    do_status: obj({
      total: int(7),
      cancelled: int(0, { description: 'DO batal pada rentang (tidak masuk total)' }),
      items: arr(ref('DashboardCount'), {
        description: 'Urutan tetap: assigned (Ditugaskan), onhold (Ditahan), running (Berjalan), completed (Selesai), failed (Gagal kirim)',
        example: [
          {
            status: 'assigned', label: 'Ditugaskan', count: 2, percent: 29,
          },
          {
            status: 'onhold', label: 'Ditahan', count: 0, percent: 0,
          },
          {
            status: 'running', label: 'Berjalan', count: 2, percent: 29,
          },
          {
            status: 'completed', label: 'Selesai', count: 2, percent: 29,
          },
          {
            status: 'failed', label: 'Gagal kirim', count: 1, percent: 14,
          },
        ],
      }),
      by_customer: arr(obj({
        customer: nullable(obj({ id: str('85af8e6d-169d-4404-89d6-afca31e642e9'), name: str('PT Contoh Jaya') }, [], { description: 'null = DO tanpa customer' })),
        total: int(4),
        percent: int(57),
        breakdown: arr(obj({ status: str('running'), label: str('Berjalan'), count: int(2) }), { description: 'Hanya status yang jumlahnya > 0' }),
      }), { description: 'Urut jumlah DO terbanyak' }),
    }),
    p2h: obj({
      date: { ...date('2026-11-05'), description: 'Tanggal P2H = end_date (paling lambat hari ini)' },
      active_units: int(5, { description: 'Unit berstatus active' }),
      counts: obj({
        layak: int(2), catatan: int(2), tidak_layak: int(0), belum: int(1),
      }),
      items: arr(ref('DashboardCount'), {
        description: 'Urutan tetap: layak (Boleh jalan), catatan (Boleh jalan · catatan), tidak_layak (Tidak layak jalan), belum (Belum P2H)',
        example: [
          {
            status: 'layak', label: 'Boleh jalan', count: 2, percent: 40,
          },
          {
            status: 'catatan', label: 'Boleh jalan · catatan', count: 2, percent: 40,
          },
          {
            status: 'tidak_layak', label: 'Tidak layak jalan', count: 0, percent: 0,
          },
          {
            status: 'belum', label: 'Belum P2H', count: 1, percent: 20,
          },
        ],
      }),
      attention: arr(obj({
        unit: obj({ id: str('84ee6f8f-7caf-4079-88ef-a73e7d6ce457'), plate: str('B 9188 KZ'), type: str('CDD Box') }),
        status: enumOf(['tidak_layak', 'belum', 'catatan'], 'belum'),
        label: str('Belum P2H'),
        note: nullable(str(null, { description: 'Keterangan item tidak sesuai, mis. "Lampu sein kiri mati"' })),
        admin_confirmed_by_driver: nullable(bool(null, { description: 'Driver sudah melapor ke admin ("sudah dikonfirmasi")' })),
        recheck_requested: bool(false, { description: 'Belum P2H karena admin meminta P2H ulang' }),
        checked_at: nullable(dt(null)),
        delivery_order: nullable(obj({
          id: str('03e0c626-6109-4f25-8aa4-0b49e641719a'),
          no: str('DO-0146'),
          status: str('assigned'),
          waiting: bool(true, { description: 'true = DO belum diterima ("menunggu")' }),
        }, [], { description: 'DO yang memakai unit ini pada tanggal P2H' })),
        driver: nullable(obj({ id: str('d4e47ef5-6d56-4d1e-972b-0b5c1b7876e8'), name: str('Sari') })),
      }), { description: 'Unit yang tidak "Boleh jalan": tidak_layak, lalu belum, lalu catatan' }),
    }),
    finance: obj({
      travel_allowance: obj({ total: money(3600000), do_count: int(7) }, [], { description: 'Uang jalan diberikan (DO pada rentang, tanpa DO batal)' }),
      expenses: obj({
        total: money(911000), receipt_total: money(600000), manual_total: money(311000), count: int(9),
      }, [], { description: 'Biaya tercatat (tanpa yang dibatalkan admin): dari struk (receipt_ocr) dan input manual' }),
      refund_to_company: obj({ total: money(2689000), unsettled_total: money(622000) }, [], { description: 'Sisa disetor driver' }),
      payable_to_driver: obj({ total: money(0), unsettled_total: money(0) }, [], { description: 'Kurang bayar ke driver' }),
      settled_count: int(1),
      pending_settlements: obj({
        count: int(2, { description: 'Semua rekap yang menunggu (bukan hanya yang ditampilkan)' }),
        items: arr(obj({
          delivery_order: obj({
            id: str('22e84b8c-ba34-474a-866d-ef2c3f43018d'), no: str('DO-0140'), completed_at: dt('2026-11-05T13:00:00+07:00'), failed_delivery: bool(true),
          }),
          driver: obj({ id: str('8a1400f8-29e5-460e-b89e-d4f5e2bfafe7'), code: str('DRV-0012'), name: str('Rudi') }),
          type: enumOf(['refund_to_company', 'payable_to_driver'], 'refund_to_company'),
          label: str('Sisa disetor'),
          amount: money(404000),
        }), { description: 'Maksimal 10, paling lama selesai lebih dulu' }),
      }, [], { description: 'Menunggu persetujuan settlement (belum disetor/dibayar, selain yang pas)' }),
    }),
    delivery_orders: arr(ref('AdminDeliveryOrder'), {
      description: 'Daftar DO pada rentang (termasuk yang batal); dipengaruhi page, limit, search, sort, sort_by. Pagination di `meta`.',
    }),
  }),

  // ---------- Admin ----------
  PageMeta: obj({
    page: int(1), limit: int(20), total: int(42), total_pages: int(3),
  }),
  AdminProfile: obj({
    id: str('4f1a8c52-9d3e-4b7a-8e61-2c5d7f90a1b3'),
    username: str('budi.admin'),
    email: str('budi@contoh.co.id'),
    phone: nullable(str('+6281234567890')),
    name: str('Budi Admin'),
    settings: obj({ language: enumOf(['id', 'en', 'zh']) }),
    status: enumOf(['active', 'suspended']),
    role: nullable(obj({ id: str('9a1c3e55-2b7d-4f80-b6a4-1d5e8c7f2a90'), name: str('Administrator'), is_system: bool(true) })),
    permissions: obj({}, [], { description: 'Hak akses dari role: { <modul>: [read, create, update, delete] }. Dipakai FE untuk menyembunyikan menu; server tetap memeriksa di setiap request.', additionalProperties: { type: 'array', items: enumOf(['read', 'create', 'update', 'delete', 'approve', 'recheck', 'reset_password']) }, example: { drivers: ['read', 'create', 'update', 'delete'] } }),
    last_login_at: nullable(dt('2026-11-05T07:00:00+07:00')),
    session: nullable(obj({ since: dt('2026-11-16T08:12:00+07:00'), device: nullable(str('Chrome, Windows')), ip: nullable(str('103.10.20.30')) }, undefined, { description: 'Sesi login yang sedang dipakai: awal login dan perangkatnya (dari User-Agent). null bila tidak diketahui' })),
    ...auditProps,
  }),
  ChangePasswordRequest: obj({
    current_password: str('<password lama>', { format: 'password' }),
    new_password: str('<password baru>', { format: 'password', description: 'Minimal 8 karakter, mengandung huruf dan angka' }),
  }, ['current_password', 'new_password']),
  PasswordResetRequest: obj({
    password: str('<password baru>', { format: 'password', description: 'Kosong = dibuatkan password sementara (dikembalikan sekali)' }),
  }),
  PasswordResetResponse: obj({
    password_reset: bool(true),
    temporary_password: str('Kp7mQ3xZ9t', { description: 'Hanya ada jika `password` tidak diisi. Tampil sekali, tidak bisa dilihat lagi' }),
  }),
  AdminDriver: obj({
    id: str('952975ba-bcf9-4a57-ac3b-be20940d8b25', { description: 'drivers.id (dipakai untuk menugaskan DO)' }),
    code: str('DRV-0021'),
    name: str('Andi'),
    phone: nullable(str('+6281234567890')),
    status: enumOf(['active', 'suspended']),
    role: nullable(obj({ id: str('4c7e9b21-8d35-4a60-b1f2-6e0a3d5c8f17'), name: str('Driver') })),
    license: obj({
      no: nullable(str('1234-5678')), type: nullable(str('B2 Umum')), expires_on: nullable(date('2028-05-01')),
    }),
    unit_today: nullable(obj({ id: str('fc06e493-e9c6-429b-9529-bc07084818ee'), plate: str('B 9123 KZ') }, undefined, { description: 'Unit yang dipegang hari ini: pengecualian harian (penugasan) bila ada, selain itu unit bawaan' })),
    default_unit: nullable(obj({ id: str('fc06e493-e9c6-429b-9529-bc07084818ee'), plate: str('B 9123 KZ'), since: nullable(dt('2024-01-12T08:00:00+07:00', { description: 'Sejak kapan menjadi driver tetap unit ini (perkiraan untuk data lama)' })) }, undefined, { description: 'Unit yang menjadikan driver ini sebagai driver bawaan (diatur di master unit: driver_id)' })),
    last_login_at: nullable(dt('2026-11-05T07:00:00+07:00')),
    locked: bool(false, { description: 'true jika akun terkunci sementara karena salah password' }),
    locked_until: nullable(dt('2026-11-05T07:15:00+07:00')),
    ...auditProps,
  }),
  AdminDriverDetail: {
    allOf: [ref('AdminDriver'), obj({
      active_do: nullable(obj({ id: str('2fb9f57e-a6e7-4890-b957-30261a15b471'), no: str('DO-0144'), status: enumOf(DO_STATUS, 'in_transit') })),
      activity: obj({ completed_orders: int(96, { description: 'Jumlah DO yang sudah selesai' }), last_login_at: nullable(dt()) }, undefined, { description: 'Bagian "Aktivitas" di form driver' }),
      failed_login_count: int(0),
      initial_password: str('Kp7mQ3xZ9t', { description: 'Hanya di response pembuatan, dan hanya jika `password` tidak diisi' }),
    })],
  },
  AdminDriverCreate: obj({
    name: str('Budi Santoso'),
    phone: nullable(str('0812-3456-7890', { description: 'Diubah ke format +62…; unik antar akun' })),
    code: str('DRV-0100', { description: 'Kosong = otomatis (DRV-0001, DRV-0002, …). Kode yang pernah dipakai tidak bisa dipakai ulang' }),
    role_id: str('4c7e9b21-8d35-4a60-b1f2-6e0a3d5c8f17', { format: 'uuid', description: 'Role driver (hak di aplikasi HP, lihat /roles dengan user_type driver). Kosong = role bawaan Driver. Role admin ditolak.' }),
    password: str('<password>', { format: 'password', description: 'Kosong = dibuatkan password sementara' }),
    license_no: nullable(str('1234-5678')),
    license_type: nullable(str('B2 Umum')),
    license_expires_on: nullable(date('2028-05-01')),
  }, ['name']),
  AdminDriverUpdate: obj({
    name: str('Budi Santoso'),
    phone: nullable(str('0812-3456-7890')),
    status: { ...enumOf(['active', 'suspended']), description: 'suspended = tidak bisa login dan sesinya dicabut' },
    role_id: str('4c7e9b21-8d35-4a60-b1f2-6e0a3d5c8f17', { format: 'uuid', description: 'Pindah ke role driver lain. Role admin ditolak.' }),
    license_no: nullable(str('1234-5678')),
    license_type: nullable(str('B2 Umum')),
    license_expires_on: nullable(date('2028-05-01')),
  }),
  AdminUser: obj({
    id: str('4f1a8c52-9d3e-4b7a-8e61-2c5d7f90a1b3'),
    username: str('budi.admin'),
    email: str('budi@contoh.co.id'),
    phone: nullable(str('+6281234567890')),
    name: str('Budi Admin'),
    status: enumOf(['active', 'suspended']),
    role: nullable(obj({ id: str('9a1c3e55-2b7d-4f80-b6a4-1d5e8c7f2a90'), name: str('Administrator'), is_system: bool(true) })),
    last_login_at: nullable(dt('2026-11-05T07:00:00+07:00')),
    locked: bool(false),
    initial_password: str('Kp7mQ3xZ9t', { description: 'Hanya di response pembuatan, dan hanya jika `password` tidak diisi' }),
    ...auditProps,
  }),
  AdminUserCreate: obj({
    name: str('Budi Admin'),
    username: str('budi.admin', { description: 'Huruf, angka, ".", "_", "-" (3-60 karakter); tidak membedakan huruf besar/kecil' }),
    email: str('budi@contoh.co.id'),
    phone: nullable(str('0812-3456-7890')),
    role_id: str('9a1c3e55-2b7d-4f80-b6a4-1d5e8c7f2a90', { format: 'uuid', description: 'Role hak akses (lihat /roles). Kosong = role Administrator, yang hanya boleh diberikan admin dengan hak setara.' }),
    password: str('<password>', { format: 'password', description: 'Kosong = dibuatkan password sementara' }),
  }, ['name', 'username', 'email']),
  AdminUserUpdate: obj({
    name: str('Budi Admin'),
    email: str('budi@contoh.co.id'),
    phone: nullable(str('0812-3456-7890')),
    status: { ...enumOf(['active', 'suspended']), description: 'Tidak bisa menonaktifkan diri sendiri' },
    role_id: str('9a1c3e55-2b7d-4f80-b6a4-1d5e8c7f2a90', { format: 'uuid', description: 'Pindah role. Tidak boleh melebihi hak admin yang mengubah, dan Administrator aktif terakhir tidak bisa dipindah.' }),
  }),
  // ---------- Baca ulang langkah perjalanan (driver) ----------
  LoadingDetail: obj({
    id: str('299c209e-2f21-484b-b328-f2dbfae18f4e'),
    delivery_order_id: str('2fb9f57e-a6e7-4890-b957-30261a15b471'),
    loaded_at: dt('2026-11-13T13:05:10+07:00'),
    gps: nullable(obj({ lat: num(-6.18), lng: num(106.94), accuracy_m: num(8) })),
    quantity_matches_do: bool(true, { description: 'Jawaban "Ya, sesuai" / "Tidak sesuai"' }),
    quantity_note: nullable(str('Kurang 1 palet', { description: 'Terisi hanya bila quantity_matches_do = false' })),
    photo_count: int(3),
    cargo_photos: arr(ref('Media'), { description: 'Foto muatan, urut sesuai pengambilan' }),
    delivery_note_pages: arr(obj({ page: int(1), media: ref('Media') }), { description: 'Halaman surat jalan gudang' }),
    ...auditProps,
  }),
  OdometerReading: obj({
    id: str('29ca88d6-4787-4e65-b668-333896c80041'),
    type: enumOf(['start', 'end']),
    km: int(45216, { description: 'Nilai efektif (hasil koreksi bila ada, selain itu hasil OCR)' }),
    fuel_level: nullable(ref('FuelLevel')),
    source: enumOf(['ocr', 'corrected']),
    ocr: nullable(obj({ km: nullable(int(45210)), fuel_level: nullable(ref('FuelLevel')) })),
    corrected: nullable(obj({ km: nullable(int(45216)), fuel_level: nullable(ref('FuelLevel')) })),
    correction_reason: nullable(str('Angka terakhir buram')),
    captured_at: dt('2026-11-13T13:20:00+07:00'),
    gps: nullable(obj({ lat: num(-6.18), lng: num(106.94), accuracy_m: num(8) })),
    media: nullable(ref('Media')),
  }),
  OdometerDetail: obj({
    delivery_order_id: str('2fb9f57e-a6e7-4890-b957-30261a15b471'),
    start: nullable(ref('OdometerReading')),
    end: nullable(ref('OdometerReading')),
    distance_km: nullable(int(68, { description: 'Akhir dikurangi awal; null bila salah satunya belum dicatat' })),
  }),
  HandoverDetail: obj({
    id: str('0f3a6d4c-7b21-4e58-9c10-2a8e5d7b1f36'),
    delivery_order_id: str('2fb9f57e-a6e7-4890-b957-30261a15b471'),
    condition: enumOf(['lengkap', 'masalah', 'gagal_kirim']),
    delivery_status: str('terkirim_lengkap'),
    recorded_at: dt('2026-11-13T16:30:00+07:00'),
    gps: nullable(obj({ lat: num(-6.3), lng: num(107.29), accuracy_m: num(10) })),
    note: nullable(str('Diterima baik')),
    receiver: nullable(obj({
      name: str('Pak Rudi'),
      signed_at: dt('2026-11-13T16:28:00+07:00'),
      acknowledges_issues: nullable(bool(true)),
      signature: nullable(ref('Media')),
    })),
    received_quantity: nullable(num(3, { description: 'Hanya untuk kondisi masalah' })),
    failure_reason: nullable(str('penerima_tidak_ada', { description: 'Hanya untuk kondisi gagal_kirim' })),
    unloading_photos: arr(ref('Media')),
    stamped_delivery_notes: arr(obj({ page: int(1), media: ref('Media') })),
    location_photos: arr(ref('Media'), { description: 'Foto lokasi (kondisi gagal_kirim)' }),
    issues: arr(obj({
      id: str('7a1c9e3b-5d24-4f80-b6a2-1c8e4d0f9a35'),
      type: enumOf(['rusak', 'kurang', 'salah_kirim', 'lainnya']),
      quantity: num(1),
      unit: str('palet'),
      note: nullable(str('Terjatuh saat bongkar')),
      photos: arr(ref('Media')),
    })),
    ...auditProps,
  }),

  // ---------- Admin - Role & Hak Akses ----------
  AdminRole: obj({
    id: str('9a1c3e55-2b7d-4f80-b6a4-1d5e8c7f2a90'),
    code: str('operasional'),
    name: str('Staf Operasional'),
    description: nullable(str('Mengelola unit dan customer')),
    permissions: obj({}, [], { description: 'Hak per modul: { "drivers": ["read", "create"], ... }. Modul dan aksi: lihat GET /roles/catalog.', additionalProperties: { type: 'array', items: enumOf(['read', 'create', 'update', 'delete', 'approve', 'recheck', 'reset_password']) }, example: { drivers: ['read'], units: ['read', 'create', 'update'] } }),
    user_type: enumOf(['admin', 'driver'], 'admin', { description: 'Jenis akun pemakai role: admin (modul pengelolaan) atau driver (modul aplikasi HP, awalan driver_)' }),
    is_system: bool(false, { description: 'true = role bawaan: Administrator (semua hak admin, terkunci penuh) atau Driver (hak default driver; hanya hak dan deskripsi yang boleh disesuaikan, tidak bisa dihapus)' }),
    is_active: bool(true, { description: 'Role nonaktif: akun yang memakainya ditolak (403 role_nonaktif)' }),
    user_count: int(2, { description: 'Jumlah akun admin yang memakai role ini' }),
    ...auditProps,
  }),
  AdminRoleCreate: obj({
    user_type: enumOf(['admin', 'driver'], 'admin', { description: 'Jenis akun pemakai role. Bawaan admin. Tidak bisa diubah sesudah dibuat. Role driver wajib memuat driver_profile:read.' }),
    name: str('Staf Operasional'),
    code: str('operasional', { description: 'Huruf kecil, angka, "_", "-" (2-40). Kosong = dibuat dari nama.' }),
    description: nullable(str('Mengelola unit dan customer')),
    permissions: obj({}, [], { description: 'Hak per modul: { "drivers": ["read", "create"], ... }. Modul dan aksi: lihat GET /roles/catalog.', additionalProperties: { type: 'array', items: enumOf(['read', 'create', 'update', 'delete', 'approve', 'recheck', 'reset_password']) }, example: { drivers: ['read'], units: ['read', 'create', 'update'] } }),
    is_active: bool(true),
  }, ['name', 'permissions']),
  AdminRoleUpdate: obj({
    name: str('Staf Operasional'),
    description: nullable(str('Mengelola unit dan customer')),
    permissions: obj({}, [], { description: 'Hak per modul: { "drivers": ["read", "create"], ... }. Modul dan aksi: lihat GET /roles/catalog.', additionalProperties: { type: 'array', items: enumOf(['read', 'create', 'update', 'delete', 'approve', 'recheck', 'reset_password']) }, example: { drivers: ['read'], units: ['read', 'create', 'update'] } }),
    is_active: bool(true),
  }),
  PermissionCatalog: obj({
    actions: arr(str('read'), { example: ['read', 'create', 'update', 'delete'] }),
    user_types: arr(str('admin'), { example: ['admin', 'driver'] }),
    resources: arr(obj({
      key: str('delivery_orders'),
      label: str('Delivery order'),
      user_type: enumOf(['admin', 'driver'], 'admin', { description: 'Jenis akun pemilik modul: modul admin hanya untuk role admin, modul driver_* hanya untuk role driver' }),
      actions: arr(str('read'), { description: 'Aksi yang tersedia pada modul ini (modul driver bisa lebih sedikit dari empat aksi)' }),
    })),
  }),

  // ---------- Admin - P2H & Media ----------
  AdminP2HListItem: obj({
    id: str('8f2c1a64-5b3d-4e7a-9c10-6d2e4f8a1b35'),
    unit: obj({ id: str('fc06e493-e9c6-429b-9529-bc07084818ee'), plate: str('B 9123 KZ'), type: str('CDD Bak') }),
    date: str('2026-11-05'),
    status: enumOf(['layak', 'catatan', 'tidak_layak']),
    can_operate: bool(true),
    checked_by: obj({ id: str('3b9e6f10-5c4d-4a72-8e1b-7d2c9a0f4e55'), name: str('Andi Pratama') }),
    checked_at: str('2026-11-05T06:30:00+07:00'),
    superseded: bool(false, { description: 'true jika P2H ini sudah digantikan karena admin meminta P2H ulang' }),
    recheck_requested: bool(false),
    ...auditProps,
  }),
  AdminP2HUpdateRequest: obj({
    items: arr(obj({
      code: str('ban'),
      result: enumOf(['sesuai', 'tidak_sesuai']),
      description: str('Tapak aus', { description: 'Wajib jika result = tidak_sesuai' }),
    }, ['code', 'result']), { description: 'Jawaban item yang dikoreksi (kode harus sudah ada di P2H ini). Status dan can_operate dihitung ulang server.' }),
  }, ['items']),
  AdminMedia: obj({
    id: str('0c8e2f61-7a4d-4b93-8d15-2e6f9a3b7c48'),
    kind: str('receipt'),
    url: str('https://example.com/media/OGO/2026/11/05/0c8e2f61.jpg'),
    thumb_url: nullable(str('https://example.com/media/OGO/2026/11/05/0c8e2f61_thumb.jpg')),
    captured_at: str('2026-11-05T09:12:00+07:00'),
    captured_by: str('3b9e6f10-5c4d-4a72-8e1b-7d2c9a0f4e55'),
    captured_by_name: str('Andi Pratama'),
    ...auditProps,
  }),

  // ---------- Admin - Master Data ----------
  AdminUnit: obj({
    id: str('fc06e493-e9c6-429b-9529-bc07084818ee'),
    driver_assigned_at: nullable(dt('2024-01-12T08:00:00+07:00', { description: 'Sejak kapan driver tetap unit ini (null bila tanpa driver)' })),
    summary: obj({
      running_order: nullable(obj({ id: str('2fb9f57e-a6e7-4890-b957-30261a15b471'), no: str('DO-0144'), status: enumOf(DO_STATUS, 'in_transit') })),
      p2h_today: obj({
        status: enumOf(['layak', 'catatan', 'tidak_layak', 'belum'], 'catatan'),
        label: str('Boleh jalan · catatan'),
        checked_at: nullable(dt()),
        recheck_requested: bool(true, { description: 'Hanya ada bila admin meminta P2H ulang' }),
      }),
    }, undefined, { description: 'Panel "Ringkasan unit": DO yang sedang berjalan dan status P2H hari ini. Hanya ada di detail (GET /units/{id})' }),
    plate: str('B 9123 KZ'),
    unit_type: str('CDD Bak', { description: 'Tipe unit (teks bebas)' }),
    max_load_kg: nullable(int(2500)),
    brand: nullable(str('Mitsubishi')),
    year: nullable(int(2022)),
    vin_number: nullable(str('MHFXW42G7N4012345', { description: 'Nomor rangka (VIN), huruf besar' })),
    status: enumOf(['active', 'maintenance', 'inactive']),
    last_odometer_km: nullable(int(45278)),
    driver_id: nullable(str('3b9e6f10-5c4d-4a72-8e1b-7d2c9a0f4e55', { format: 'uuid', description: 'Driver bawaan unit ini' })),
    driver: nullable(obj({ id: str('3b9e6f10-5c4d-4a72-8e1b-7d2c9a0f4e55'), code: str('DRV-0021'), name: str('Andi') }, undefined, { description: 'Detail driver bawaan (dari driver_id)' })),
    stnk_expires_on: nullable(date('2027-03-15')),
    kir_expires_on: nullable(date('2026-12-01')),
    stnk_expired: bool(false),
    kir_expired: bool(false),
    ...auditProps,
  }),
  AdminUnitCreate: obj({
    plate: str('b-9123-kz', { description: 'Dinormalisasi menjadi "B 9123 KZ"; unik di antara unit aktif' }),
    unit_type: str('CDD Bak', { description: 'Tipe unit, teks bebas (2-40 karakter). Contoh: CDD Bak, CDD Box, Fuso Box, Tronton, Wingbox.' }),
    max_load_kg: nullable(int(2500, { description: 'Kapasitas muatan (kg), opsional' })),
    brand: nullable(str('Mitsubishi')),
    year: nullable(int(2022)),
    vin_number: nullable(str('MHFXW42G7N4012345', { description: 'Nomor rangka (VIN): 5-30 karakter huruf/angka/"-", dinormalkan huruf besar, unik di antara unit aktif' })),
    last_odometer_km: nullable(int(45278)),
    status: enumOf(['active', 'maintenance', 'inactive'], 'active'),
    driver_id: nullable(str('3b9e6f10-5c4d-4a72-8e1b-7d2c9a0f4e55', { format: 'uuid', description: 'Driver bawaan unit (`drivers.id`). Driver ini otomatis memegang unit setiap hari tanpa penugasan harian. null = tanpa driver bawaan. Satu driver hanya bisa jadi bawaan satu unit (422 bila sudah dipakai unit lain).' })),
    stnk_expires_on: nullable(date('2027-03-15')),
    kir_expires_on: nullable(date('2026-12-01')),
  }, ['plate', 'unit_type']),
  AdminUnitUpdate: obj({
    plate: str('B 9123 KZ'),
    unit_type: str('CDD Bak'),
    max_load_kg: nullable(int(2500)),
    brand: nullable(str('Mitsubishi')),
    year: nullable(int(2022)),
    vin_number: nullable(str('MHFXW42G7N4012345', { description: 'Kirim null untuk mengosongkan' })),
    last_odometer_km: nullable(int(45278)),
    status: enumOf(['active', 'maintenance', 'inactive']),
    driver_id: nullable(str('3b9e6f10-5c4d-4a72-8e1b-7d2c9a0f4e55', { format: 'uuid', description: 'Driver bawaan unit (`drivers.id`). Driver ini otomatis memegang unit setiap hari tanpa penugasan harian. null = tanpa driver bawaan. Satu driver hanya bisa jadi bawaan satu unit (422 bila sudah dipakai unit lain). Kirim null untuk mengosongkan.' })),
    stnk_expires_on: nullable(date('2027-03-15')),
    kir_expires_on: nullable(date('2026-12-01')),
  }),
  AdminCustomer: obj({
    id: str('6a1d4e72-8b35-4c09-9f27-0e5b3d8a1c64'),
    code: str('CUST-001'),
    name: str('PT Contoh Jaya'),
    nomor_customer: nullable(str('NC-001')),
    phone: nullable(str('021-5550100')),
    email: nullable(str('info@contohjaya.co.id')),
    location_count: int(2, { description: 'Jumlah lokasi aktif milik customer ini' }),
    ...auditProps,
  }),
  AdminCustomerCreate: obj({
    code: str('CUST-001', { description: 'Huruf besar/angka/`_`/`-` (2-30), unik, tidak bisa diubah' }),
    name: str('PT Contoh Jaya'),
    nomor_customer: nullable(str('NC-001', { description: 'Nomor customer opsional' })),
    phone: nullable(str('021-5550100')),
    email: nullable(str('info@contohjaya.co.id')),
  }, ['code', 'name']),
  AdminCustomerUpdate: obj({
    name: str('PT Contoh Jaya'),
    nomor_customer: nullable(str('NC-001', { description: 'Kirim null untuk mengosongkan' })),
    phone: nullable(str('021-5550100')),
    email: nullable(str('info@contohjaya.co.id')),
  }),
  AdminLocation: obj({
    id: str('d84f2a61-7c93-4e05-a1b8-5f3e9c0d7a22'),
    type: enumOf(['warehouse', 'depot', 'customer_site']),
    name: str('Gudang Cakung'),
    address: str('Jl. Raya Cakung Cilincing, Jakarta Timur'),
    city: nullable(str('Cakung')),
    maps_url: nullable(str('https://maps.app.goo.gl/AbCdEf123', { description: 'Tautan Google Maps lokasi ini' })),
    gps: nullable(obj({ lat: num(-6.18), lng: num(106.94) })),
    geofence_radius_m: nullable(int(200)),
    operating_hours: nullable(str('08:00-17:00')),
    pic: nullable(obj({ name: nullable(str('Pak Rudi')), phone: nullable(str('+628111222333')) })),
    customer: nullable(obj({ id: str('6a1d4e72-8b35-4c09-9f27-0e5b3d8a1c64'), name: str('PT Contoh Jaya') })),
    ...auditProps,
  }),
  AdminLocationCreate: obj({
    type: enumOf(['warehouse', 'depot', 'customer_site']),
    customer_id: nullable(str('6a1d4e72-8b35-4c09-9f27-0e5b3d8a1c64', { description: 'Wajib untuk customer_site; harus kosong untuk warehouse/depot' })),
    name: str('Gudang Cakung'),
    address: str('Jl. Raya Cakung Cilincing, Jakarta Timur'),
    city: nullable(str('Cakung')),
    maps_url: nullable(str('https://maps.app.goo.gl/AbCdEf123', { description: 'Tautan Google Maps (tempel dari tombol Bagikan). Bila lat/lng kosong dan tautan memuat koordinat (tautan panjang google.com/maps), lat/lng diisi otomatis; tautan pendek maps.app.goo.gl tidak bisa dibaca koordinatnya.' })),
    lat: nullable(num(-6.18, { description: 'Harus berpasangan dengan lng' })),
    lng: nullable(num(106.94)),
    geofence_radius_m: nullable(int(200, { description: '10-5000, default 200' })),
    operating_hours: nullable(str('08:00-17:00', { description: 'HH:mm-HH:mm' })),
    pic_name: nullable(str('Pak Rudi')),
    pic_phone: nullable(str('+628111222333')),
  }, ['type', 'name', 'address']),
  AdminLocationUpdate: obj({
    type: enumOf(['warehouse', 'depot', 'customer_site']),
    customer_id: nullable(str('6a1d4e72-8b35-4c09-9f27-0e5b3d8a1c64')),
    name: str('Gudang Cakung'),
    address: str('Jl. Raya Cakung Cilincing, Jakarta Timur'),
    city: nullable(str('Cakung')),
    maps_url: nullable(str('https://maps.app.goo.gl/AbCdEf123', { description: 'Tautan Google Maps. Mengubahnya tanpa lat/lng ikut memperbarui koordinat bila tautan memuat koordinat.' })),
    lat: nullable(num(-6.18)),
    lng: nullable(num(106.94)),
    geofence_radius_m: nullable(int(200)),
    operating_hours: nullable(str('08:00-17:00')),
    pic_name: nullable(str('Pak Rudi')),
    pic_phone: nullable(str('+628111222333')),
  }),

  AdminP2HUnit: obj({
    unit: obj({
      id: str('fc06e493-e9c6-429b-9529-bc07084818ee'), plate: str('B 9123 KZ'), type: str('CDD Bak'), brand: nullable(str('Mitsubishi')), year: nullable(int(2022)),
    }),
    date: str('2026-11-19'),
    status: enumOf(['layak', 'catatan', 'tidak_layak', 'belum'], 'catatan', { description: 'belum = unit aktif yang belum di-P2H pada tanggal itu' }),
    label: str('Boleh jalan · catatan'),
    can_operate: bool(true),
    p2h_id: nullable(str('0c4f6f2e-1d6b-4d0a-9a5e-3d0d3d7a7a10')),
    checked_by: nullable(obj({ id: str('952975ba-bcf9-4a57-ac3b-be20940d8b25'), name: str('Budi') })),
    checked_at: nullable(dt()),
    note: nullable(str('Lampu sein kiri mati', { description: 'Keterangan driver untuk item yang tidak sesuai' })),
    admin_confirmed_by_driver: nullable(bool(true)),
    recheck_requested: bool(false),
    waiting_orders: int(1, { description: 'Jumlah DO assigned yang menunggu unit ini pada tanggal itu' }),
  }),
  AdminP2HUnitMeta: {
    allOf: [ref('PageMeta'), obj({
      date: str('2026-11-19'),
      summary: obj({
        active_units: int(5),
        counts: obj({
          layak: int(2), catatan: int(2), tidak_layak: int(0), belum: int(1),
        }),
        items: arr(obj({ status: str('belum'), label: str('Belum P2H'), count: int(1) })),
      }, undefined, { description: 'Hitungan per status atas unit yang cocok pencarian (tidak terpengaruh filter status)' }),
    })],
  },
  // ---------- Admin - Delivery Order & Penugasan ----------
  AdminDeliveryOrder: obj({
    id: str('2fb9f57e-a6e7-4890-b957-30261a15b471'),
    no: str('DO-0145', { description: 'Nomor DO lengkap = document_prefix + document_number (min. 4 digit). Dibentuk database, tidak bisa diubah.' }),
    document_prefix: str('DO-', { description: 'Teks di depan nomor, dari pengaturan `document_prefix` saat DO dibuat' }),
    document_number: int(145, { description: 'Nomor urut auto increment (berlanjut walau prefix diganti)' }),
    status: enumOf(DO_STATUS, 'assigned'),
    delivery_status: nullable(enumOf(DELIVERY_STATUS, 'terkirim_lengkap')),
    driver: obj({ id: str('952975ba-bcf9-4a57-ac3b-be20940d8b25'), code: str('DRV-0021'), name: str('Andi') }),
    unit: obj({ id: str('fc06e493-e9c6-429b-9529-bc07084818ee'), plate: str('B 9123 KZ'), type: str('CDD Bak') }),
    last_stage: obj({
      code: str('odometer_start', { description: 'Kejadian terakhir yang mengubah tahap: assigned, on_hold, resumed, accepted, loaded, odometer_start, handover, odometer_end, completed, cancelled' }),
      label: str('Perjalanan'),
      at: dt(),
    }, undefined, { description: 'Kolom "Tahap terakhir" di daftar DO. Hanya ada di daftar (POST /delivery-orders/get)' }),
    flags: arr(obj({
      code: enumOf(['correction', 'p2h_missing', 'p2h_unfit', 'needs_reschedule', 'needs_review'], 'correction'),
      label: str('1 koreksi'),
      count: int(1, { description: 'Hanya untuk correction' }),
    }), { description: 'Kolom "Catatan" di daftar DO. Hanya ada di daftar' }),
    settlement: obj({
      status: enumOf(['none', 'pending', 'settled'], 'pending', { description: 'none = belum ada rekap, pending = rekap belum disetor/dibayar, settled = sudah' }),
      type: enumOf(['refund_to_company', 'payable_to_driver', 'balanced'], 'refund_to_company'),
    }, ['status'], { description: 'Status rekap uang jalan. Hanya ada di daftar' }),
    rescheduled_from_id: nullable(str('2fb9f57e-a6e7-4890-b957-30261a15b471', { description: 'DO ini adalah DO ulang dari DO gagal kirim itu' })),
    rescheduled_to_id: nullable(str('2fb9f57e-a6e7-4890-b957-30261a15b471', { description: 'DO gagal kirim ini sudah dijadwalkan ulang menjadi DO itu' })),
    unit_assignment: obj({
      work_date: str('2026-11-19', { description: 'Tanggal kerja DO = tanggal rencana muat (WIB), atau hari ini bila tanpa rencana muat' }),
      source: enumOf(['default', 'override'], 'override', { description: 'default = driver adalah driver bawaan unit; override = driver atau unit pengganti' }),
    }, undefined, { description: 'Unit driver pada tanggal kerja DO ini. Ada di daftar, detail, dan respons buat/ubah/lanjutkan. Tidak ada tabel penugasan terpisah: unit driver per hari dibaca dari DO dan driver bawaan unit.' }),
    customer: nullable(obj({ id: str('6a1d4e72-8b35-4c09-9f27-0e5b3d8a1c64'), name: str('PT Contoh Jaya') })),
    customer_reference_no: nullable(str('PO-2026-00123', { description: 'Nomor referensi dari customer (mis. no PO); null bila tidak diisi' })),
    route: str('Cakung → PT Contoh Jaya, Karawang'),
    origin: obj({ name: str('Gudang Cakung'), city: nullable(str('Cakung')), maps_url: nullable(str('https://maps.app.goo.gl/AbCdEf123', { description: 'Tautan Google Maps: maps_url lokasi bila diisi admin, kalau kosong dibuat dari koordinat, null bila koordinat juga kosong' })) }),
    destination: obj({ name: str('PT Contoh Jaya'), city: nullable(str('Karawang')), maps_url: nullable(str('https://maps.google.com/?q=-6.30,107.29', { description: 'Tautan Google Maps: maps_url lokasi bila diisi admin, kalau kosong dibuat dari koordinat, null bila koordinat juga kosong' })) }),
    planned_load_at: nullable(dt('2026-11-05T13:00:00+07:00')),
    assigned_at: dt('2026-11-05T06:55:00+07:00'),
    cargo_type: ref('CargoType'),
    cargo_details: ref('CargoDetails'),
    estimated_distance_km: nullable(num(70)),
    travel_allowance_amount: money(600000),
    expense_total: money(263500),
    odometer_start_km: nullable(int(45210)),
    odometer_end_km: nullable(int(45278)),
    distance_km: nullable(int(68)),
    accepted_at: nullable(dt()),
    started_at: nullable(dt()),
    completed_at: nullable(dt()),
    on_hold_at: nullable(dt(), { description: 'Diisi saat DO di-onhold; kosong lagi setelah dilanjutkan' }),
    on_hold_reason: nullable(str('Driver dialihkan ke unit lain hari ini')),
    cancelled_at: nullable(dt()),
    cancel_reason: nullable(str('Pelanggan membatalkan pesanan')),
    needs_review: bool(false, { description: 'Ada bacaan odometer atau struk BBM yang perlu dilihat admin (alasan per bacaan ada di detail). Bisa difilter lewat `needs_review` di daftar' }),
    ...auditProps,
  }),
  AdminAiValue: obj({
    status: enumOf(['queued', 'processing', 'done', 'failed'], 'done', { description: 'Status pengecekan AI yang diminta FE untuk foto ini' }),
    km: nullable(int(45278)),
    fuel_level: nullable(ref('FuelLevel')),
    confidence: nullable(num(0.93)),
    display_mode: enumOf(['odo', 'trip'], 'odo', { description: 'Layar asal km: odometer total (didahulukan bila ODO dan Trip tampil bersamaan) atau trip meter. Hanya bila km terbaca' }),
    odo_km: nullable({ ...int(10), description: 'Odometer total yang terbaca (km bulat), bila ada di layar' }),
    trip_km: nullable({ ...num(10.4), description: 'Trip meter yang terbaca (satu desimal), bila ada di layar. Dicatat terpisah dari odo_km' }),
    extras: obj({
      adblue_percent: nullable(int(36)),
      battery_voltage: nullable(num(25.1)),
      trip_fuel_consumption: nullable(num(80, { description: 'L/100km' })),
      odo_fuel_consumption: nullable(num(32.5, { description: 'L/100km' })),
      total_fuel_l: nullable(num(16)),
      total_hours: nullable(num(4.7)),
      fuel_rate_lph: nullable(num(0)),
      oil_pressure_bar: nullable(num(0)),
      air_pressure_1_bar: nullable(num(1)),
      air_pressure_2_bar: nullable(num(0)),
      speed_kmh: nullable(int(0)),
      rpm: nullable(int(0)),
      coolant_fraction: nullable(num(0.1)),
      warning_lights: { type: 'array', items: { type: 'string', enum: ['parking_brake', 'stop', 'brake_system', 'oil_pressure', 'check_engine', 'battery', 'abs', 'coolant', 'other'] }, example: ['parking_brake', 'stop'] },
      lcd_page: enumOf(['odometer', 'fuel_info', 'consumption', 'menu', 'other'], 'odometer'),
      lcd_text: { type: 'array', items: { type: 'string' }, example: ['Trip: 10.4km ODO: 10km'] },
    }, undefined, { description: 'Semua bacaan lain yang terlihat di foto dashboard (hanya yang terbaca), disimpan walau belum dipakai FE: AdBlue, voltase aki, konsumsi bahan bakar, jam mesin, tekanan oli/udara, kecepatan, rpm, suhu mesin, lampu peringatan yang menyala, halaman LCD, dan seluruh teks LCD' }),
    fuel_percent: nullable({ ...int(14), description: 'Persen bahan bakar yang tertulis di LCD (bukan AdBlue), bila ada. Dari persen ini fuel_level ditetapkan' }),
    note: str('digits are blurred by glare', { description: 'Alasan dari AI bila km atau bahan bakar tidak terbaca (hanya bila ada)' }),
    error: obj({ code: str('ai_unavailable'), message: str('OpenAI sedang bermasalah') }, undefined, { description: 'Hanya bila status failed' }),
  }, ['status'], { description: 'Hasil AI hanya pembanding (tidak pernah menjadi nilai efektif). Odometer: km, fuel_level, confidence. null = FE tidak meminta pengecekan AI' }),
  AdminDeliveryOrderDetail: {
    allOf: [ref('AdminDeliveryOrder'), obj({
      origin: obj({
        location_id: str('d84f2a61-7c93-4e05-a1b8-5f3e9c0d7a22'),
        name: str('Gudang Cakung'),
        address: str('Jl. Raya Cakung Cilincing, Jakarta Timur'),
        city: nullable(str('Cakung')),
        gps: nullable(obj({ lat: num(-6.18), lng: num(106.94) })),
        maps_url: nullable(str('https://maps.app.goo.gl/AbCdEf123', { description: 'Tautan Google Maps: maps_url lokasi bila diisi admin, kalau kosong dibuat dari koordinat, null bila koordinat juga kosong' })),
      }, undefined, { description: 'Salinan alamat saat DO dibuat (tidak ikut berubah jika lokasi master diubah)' }),
      destination: obj({
        location_id: str('d84f2a61-7c93-4e05-a1b8-5f3e9c0d7a23'),
        name: str('PT Contoh Jaya'),
        address: str('Kawasan Industri KIIC, Karawang'),
        city: nullable(str('Karawang')),
        gps: nullable(obj({ lat: num(-6.3), lng: num(107.29) })),
        maps_url: nullable(str('https://maps.google.com/?q=-6.30,107.29', { description: 'Tautan Google Maps: maps_url lokasi bila diisi admin, kalau kosong dibuat dari koordinat, null bila koordinat juga kosong' })),
        operating_hours: nullable(str('08:00-17:00')),
        pic: nullable(obj({ name: nullable(str('Pak Rudi')), phone: nullable(str('+628111222333')) })),
      }),
      travel_allowance: obj({ amount: money(600000), received_at: nullable(dt()) }),
      rescheduled_from: nullable(obj({ id: str('2fb9f57e-a6e7-4890-b957-30261a15b471'), no: str('DO-0140') }), { description: 'DO gagal kirim asal DO ulang ini' }),
      rescheduled_to: nullable(obj({ id: str('3c8a1d90-7e24-4f6b-9a31-5d2e8f4b7c10'), no: str('DO-0152') }), { description: 'DO ulang dari DO gagal kirim ini' }),
      timeline: arr(obj({
        id: int(1),
        event: str('assigned', { description: 'assigned, updated, on_hold, resumed, accepted, loaded, odometer_start, expense_added, expense_voided, handover, odometer_end, completed, cancelled, settled, rescheduled' }),
        label: str('DO diterima', { description: 'Judul jadi untuk ditampilkan (mis. "BBM dicatat")' }),
        detail: nullable(str('Andi · P2H unit B 9123 KZ boleh jalan dengan catatan', { description: 'Keterangan jadi, disusun dari payload dan data DO (berlaku juga untuk kejadian lama)' })),
        from_status: nullable(str('assigned')),
        to_status: nullable(str('accepted')),
        occurred_at: dt(),
        actor: nullable(obj({ id: str('4f1a8c52-9d3e-4b7a-8e61-2c5d7f90a1b3'), name: str('Budi Admin'), role: enumOf(['admin', 'driver']) })),
        gps: nullable(ref('Gps')),
        payload: { type: 'object', nullable: true, additionalProperties: true },
      }), { description: 'Jejak setiap langkah, dari penugasan sampai selesai/batal' }),
      loading: nullable(obj({
        loaded_at: dt(), quantity_matches_do: bool(true), quantity_note: nullable(str('Menyusul 1 palet')), photo_count: int(3),
      })),
      odometer: obj({
        start: nullable(obj({
          km: int(45210),
          source: enumOf(['ocr', 'corrected']),
          fuel_level: nullable(ref('FuelLevel')),
          captured_at: dt(),
          photo: nullable(ref('Media')),
          ocr: nullable(obj({ km: nullable(int(45210)), fuel_level: nullable(ref('FuelLevel')) }, undefined, { description: 'Hasil OCR dari FE (HP)' })),
          ai: nullable(ref('AdminAiValue')),
          corrected: nullable(obj({ km: int(45210), fuel_level: ref('FuelLevel') }, undefined, { description: 'Koreksi driver (hanya yang dikoreksi)' })),
          correction_reason: nullable(str('Angka buram')),
          needs_review: bool(false),
          review_reasons: arr(str('fe_ai_berbeda'), { description: 'dikoreksi_driver, fe_ai_berbeda, koreksi_beda_ai, keyakinan_ai_rendah, ai_tidak_terbaca, km_mundur (odometer), total_tidak_cocok dan jam_struk_di_luar_do (struk)' }),
        })),
        end: nullable(obj({
          km: int(45278),
          source: enumOf(['ocr', 'corrected']),
          fuel_level: nullable(ref('FuelLevel')),
          captured_at: dt(),
          photo: nullable(ref('Media')),
          ocr: nullable(obj({ km: nullable(int(45278)), fuel_level: nullable(ref('FuelLevel')) }, undefined, { description: 'Hasil OCR dari FE (HP)' })),
          ai: nullable(ref('AdminAiValue')),
          corrected: nullable(obj({ km: int(45278), fuel_level: ref('FuelLevel') }, undefined, { description: 'Koreksi driver (hanya yang dikoreksi)' })),
          correction_reason: nullable(str('Angka buram')),
          needs_review: bool(false),
          review_reasons: arr(str('fe_ai_berbeda'), { description: 'dikoreksi_driver, fe_ai_berbeda, koreksi_beda_ai, keyakinan_ai_rendah, ai_tidak_terbaca, km_mundur (odometer), total_tidak_cocok dan jam_struk_di_luar_do (struk)' }),
        })),
      }),
      expenses: arr(obj({
        id: str('5f0c2a9e-7d41-4b83-9e6a-1c8d3b4a5e70'),
        category: str('tol'),
        label: str('Tol Cikampek'),
        amount: money(54500),
        has_proof: bool(false),
        proof_photo: nullable(ref('Media')),
        corrected: bool(false),
        receipt: obj({
          ocr: nullable(obj({}, undefined, { additionalProperties: true, description: 'Hasil OCR dari FE: time, fuel_type, liters, price_per_liter, total' })),
          ai: nullable(obj({
            status: enumOf(['queued', 'processing', 'done', 'failed'], 'done'),
            fields: nullable(obj({}, undefined, { additionalProperties: true, description: 'Hasil AI (pembanding): total, liters, price_per_liter, fuel_type, merchant, date, time' })),
            confidence: nullable(num(0.88)),
            error: obj({ code: str('ai_unavailable'), message: str('OpenAI sedang bermasalah') }, undefined, { description: 'Hanya bila status failed' }),
          }, ['status'])),
          corrected: nullable(obj({}, undefined, { additionalProperties: true, description: 'Koreksi driver (hanya field yang dikoreksi)' })),
          correction_reason: nullable(str('Salah baca angka')),
        }, undefined, { description: 'Hanya untuk struk BBM: tiga nilai terpisah untuk dicek admin terhadap foto' }),
        needs_review: bool(false),
        review_reasons: arr(str('total_tidak_cocok'), { description: 'dikoreksi_driver, fe_ai_berbeda, koreksi_beda_ai, keyakinan_ai_rendah, ai_tidak_terbaca, km_mundur (odometer), total_tidak_cocok dan jam_struk_di_luar_do (struk)' }),
        checks: { type: 'object', nullable: true, additionalProperties: true },
        voided: bool(false, { description: 'Biaya yang dibatalkan tetap tampil sebagai jejak, tidak dihitung di total' }),
        recorded_at: dt(),
      })),
      handover: nullable(obj({
        id: str('7c2d9e41-5a3b-4f68-b012-8e6d1c4a9f35'),
        condition: enumOf(['lengkap', 'masalah', 'gagal_kirim']),
        delivery_status: enumOf(DELIVERY_STATUS),
        receiver_name: nullable(str('Pak Rudi')),
        signed_at: nullable(dt()),
        received_quantity: nullable(num(3)),
        acknowledges_issues: nullable(bool(true)),
        failure_reason: nullable(str('penerima_tidak_ada')),
        note: nullable(str('Sudah menunggu 30 menit')),
        recorded_at: dt(),
        issues: arr(obj({
          type: enumOf(['rusak', 'kurang', 'salah_kirim', 'lainnya']), quantity: num(1), unit: str('palet'), note: nullable(str('Jatuh')), photo_count: int(1),
        })),
      })),
      settlement: nullable(obj({
        type: enumOf(['refund_to_company', 'payable_to_driver', 'balanced']),
        amount: money(336500),
        travel_allowance: money(600000),
        expense_total: money(263500),
        distance_km: nullable(num(68)),
        duration_minutes: nullable(int(183)),
        settled_at: nullable(dt()),
      })),
      media: arr({
        allOf: [ref('Media'), obj({ purpose: enumOf(['loading', 'delivery_note', 'unloading', 'stamped_delivery_note', 'signature', 'location']), page_no: nullable(int(1)) })],
      }),
    })],
  },
  AdminDeliveryOrderCreate: obj({
    driver_id: str('952975ba-bcf9-4a57-ac3b-be20940d8b25', { description: 'drivers.id; driver harus aktif' }),
    unit_id: str('fc06e493-e9c6-429b-9529-bc07084818ee', { description: 'Unit harus berstatus active' }),
    origin_location_id: str('d84f2a61-7c93-4e05-a1b8-5f3e9c0d7a22'),
    destination_location_id: str('d84f2a61-7c93-4e05-a1b8-5f3e9c0d7a23', { description: 'Tidak boleh sama dengan lokasi asal' }),
    customer_id: nullable(str('6a1d4e72-8b35-4c09-9f27-0e5b3d8a1c64', {
      description: 'Boleh dikosongkan: diturunkan dari lokasi tujuan. Jika diisi harus sesuai customer lokasi tujuan',
    })),
    customer_reference_no: nullable(str('PO-2026-00123', { maxLength: 100, description: 'Opsional. Nomor referensi dari customer (mis. no PO). "" atau null = dikosongkan' })),
    planned_load_at: nullable(dt('2026-11-05T13:00:00+07:00')),
    cargo_type: ref('CargoTypeInput'),
    cargo_details: ref('CargoDetailsInput'),
    estimated_distance_km: nullable(num(70)),
    travel_allowance_amount: money(600000),
  }, ['driver_id', 'unit_id', 'origin_location_id', 'destination_location_id']),
  AdminDeliveryOrderUpdate: obj({
    driver_id: str('952975ba-bcf9-4a57-ac3b-be20940d8b25'),
    unit_id: str('fc06e493-e9c6-429b-9529-bc07084818ee'),
    origin_location_id: str('d84f2a61-7c93-4e05-a1b8-5f3e9c0d7a22'),
    destination_location_id: str('d84f2a61-7c93-4e05-a1b8-5f3e9c0d7a23', { description: 'Mengganti tujuan memperbarui salinan alamat dan menurunkan ulang customer' }),
    customer_id: nullable(str('6a1d4e72-8b35-4c09-9f27-0e5b3d8a1c64')),
    customer_reference_no: nullable(str('PO-2026-00123', { maxLength: 100, description: 'Opsional. "" atau null = dikosongkan' })),
    planned_load_at: nullable(dt('2026-11-05T13:00:00+07:00')),
    cargo_type: ref('CargoTypeInput'),
    cargo_details: { ...ref('CargoDetailsInput'), description: 'Dikirim = mengganti SELURUH rincian (bukan digabung); null atau [] = dikosongkan' },
    estimated_distance_km: nullable(num(70)),
    travel_allowance_amount: money(600000),
  }),
  HoldDeliveryOrderRequest: obj({ reason: nullable(str('Driver dialihkan ke unit lain hari ini', { description: 'Opsional, 3-300 karakter' })) }),
  CancelDeliveryOrderRequest: obj({ reason: str('Pelanggan membatalkan pesanan', { description: '3-300 karakter' }) }, ['reason']),
  // ---------- Admin - P2H ulang, Biaya, Rekap Uang Jalan ----------
  P2HRecheckRequest: obj({ note: str('Lampu sein sudah diganti, mohon P2H ulang', { description: '3-300 karakter; dilihat driver di aplikasi' }) }, ['note']),
  P2HRecheckResponse: obj({
    unit: ref('UnitRef'),
    date: date(),
    status: enumOf(['belum']),
    recheck_requested: bool(true),
    note: str('Lampu sein sudah diganti, mohon P2H ulang'),
    previous: obj({
      id: str('1e6a4c82-9b3d-4f57-a801-3d7c5e2b9f64'), status: enumOf(P2H_STATUS, 'catatan'), checked_by: str('Budi'), checked_at: dt(),
    }),
  }),
  VoidExpenseRequest: obj({ reason: str('Struk tidak sesuai rute perjalanan', { description: '3-300 karakter' }) }, ['reason']),
  AdminExpense: obj({
    id: str('5f0c2a9e-7d41-4b83-9e6a-1c8d3b4a5e70'),
    delivery_order: obj({ id: str('2fb9f57e-a6e7-4890-b957-30261a15b471'), no: str('DO-0144'), status: enumOf(DO_STATUS, 'completed') }),
    driver: obj({ id: str('952975ba-bcf9-4a57-ac3b-be20940d8b25'), code: str('DRV-0021'), name: str('Andi') }),
    category: obj({ code: str('bbm'), label: str('BBM') }),
    label: str('Solar 30 L'),
    amount: money(204000),
    description: nullable(str('Tol Cikampek')),
    proof: nullable(obj({ url: str('https://cdn.example.com/media/struk.jpg'), thumb_url: nullable(str('https://cdn.example.com/media/struk_thumb.jpg')) })),
    receipt: nullable(obj({
      fuel_type: nullable(str('Solar')),
      liters: nullable(num(30)),
      price_per_liter: nullable(money(6800)),
      time: nullable(str('14:32')),
      ocr: {
        type: 'object', nullable: true, additionalProperties: true, description: 'Hasil OCR dari HP'
      },
      corrected: {
        type: 'object', nullable: true, additionalProperties: true, description: 'Hanya field yang dikoreksi driver'
      },
      correction_reason: nullable(str('OCR salah baca harga')),
      checks: {
        type: 'object', nullable: true, additionalProperties: true, description: 'liters_x_price_matches_total, receipt_time_within_do, receipt_not_used_before'
      },
    }, undefined, { description: 'Hanya untuk kategori struk (BBM)' })),
    gps: nullable(ref('Gps')),
    recorded_at: dt(),
    voided: nullable(obj({
      at: dt(),
      by: nullable(obj({ id: str('4f1a8c52-9d3e-4b7a-8e61-2c5d7f90a1b3'), name: str('Budi Admin') })),
      reason: str('Struk tidak sesuai rute perjalanan'),
    }, undefined, { description: 'Terisi jika biaya dibatalkan; biaya tetap tampil sebagai jejak tetapi tidak dihitung' })),
    ...auditProps,
  }),
  SettleRequest: obj({
    note: nullable(str('Disetor tunai ke kasir, bukti #2231', { description: 'Maksimal 300 karakter' })),
    settled_at: dt('2026-11-06T09:30:00+07:00', { description: 'Default: sekarang. Tidak boleh di masa depan' }),
  }),
  AdminSettlement: obj({
    delivery_order: obj({
      id: str('2fb9f57e-a6e7-4890-b957-30261a15b471'), no: str('DO-0144'), route: str('Cakung → PT Contoh Jaya, Karawang'), completed_at: dt(),
    }),
    driver: obj({ id: str('952975ba-bcf9-4a57-ac3b-be20940d8b25'), code: str('DRV-0021'), name: str('Andi') }),
    unit_plate: str('B 9123 KZ'),
    type: enumOf(['refund_to_company', 'payable_to_driver', 'balanced']),
    label: str('Sisa disetor'),
    amount: money(336500),
    travel_allowance: money(600000),
    expense_total: money(263500),
    distance_km: nullable(num(68)),
    duration_minutes: nullable(int(183)),
    settled: nullable(obj({
      at: dt(),
      by: nullable(obj({ id: str('4f1a8c52-9d3e-4b7a-8e61-2c5d7f90a1b3'), name: str('Budi Admin') })),
      note: nullable(str('Disetor tunai ke kasir, bukti #2231')),
    }, undefined, { description: 'null = belum disetor/dibayar' })),
  }),
  SettlementListMeta: {
    allOf: [ref('PageMeta'), obj({
      summary: obj({
        refund_total: money(336500),
        payable_total: money(0),
        unsettled_count: int(1, { description: 'Rekap yang belum disetor/dibayar (tidak menghitung yang pas)' }),
      }, undefined, { description: 'Total atas SEMUA hasil filter, bukan hanya halaman ini' }),
    })],
  },

  // ---------- Admin - Konfigurasi ----------
  AdminP2HItem: obj({
    code: str('ban', { description: 'Kode item (huruf kecil), tidak bisa diubah' }),
    label: str('Ban'),
    hint: nullable(str('Tekanan dan kondisi tapak')),
    is_critical: bool(false, { description: 'Jawaban "tidak sesuai" pada item kritis membuat unit tidak layak jalan' }),
    sort_order: int(1),
    is_active: bool(true, { description: 'Item nonaktif tidak muncul di checklist driver, tetapi jawaban lama tetap utuh' }),
    ...auditProps,
  }),
  AdminP2HItemCreate: obj({
    code: str('klakson', { description: 'Huruf kecil, angka, "_" atau "-" (2-30), unik, tidak bisa diubah' }),
    label: str('Klakson'),
    hint: nullable(str('Berbunyi normal')),
    is_critical: bool(false),
    sort_order: int(5, { description: 'Kosong = di urutan terakhir' }),
    is_active: bool(true),
  }, ['code', 'label']),
  AdminP2HItemUpdate: obj({
    label: str('Klakson'),
    hint: nullable(str('Berbunyi normal')),
    is_critical: bool(false),
    sort_order: int(5),
    is_active: bool(true),
  }),
  AdminExpenseCategory: obj({
    code: str('bbm', { description: 'Kode kategori (huruf kecil), tidak bisa diubah' }),
    label: str('BBM'),
    input: enumOf(['receipt_ocr', 'manual'], 'receipt_ocr', { description: 'receipt_ocr = foto struk + hasil OCR dari HP; manual = isi jumlah sendiri' }),
    description_required: bool(false),
    proof_required: bool(true),
    sort_order: int(1),
    is_active: bool(true, { description: 'Kategori nonaktif tidak bisa dipilih driver (hilang dari /config), biaya lama tetap utuh' }),
    expense_count: int(12, { description: 'Jumlah biaya yang memakai kategori ini' }),
    ...auditProps,
  }),
  AdminExpenseCategoryCreate: obj({
    code: str('kuli'),
    label: str('Uang kuli'),
    input: enumOf(['receipt_ocr', 'manual'], 'manual'),
    description_required: bool(true),
    proof_required: bool(false),
    sort_order: int(5, { description: 'Kosong = di urutan terakhir' }),
    is_active: bool(true),
  }, ['code', 'label', 'input']),
  AdminExpenseCategoryUpdate: obj({
    label: str('Uang kuli'),
    input: { ...enumOf(['receipt_ocr', 'manual'], 'manual'), description: 'Tidak bisa diubah jika sudah ada biaya dengan kategori ini' },
    description_required: bool(true),
    proof_required: bool(false),
    sort_order: int(5),
    is_active: bool(true),
  }),
  AdminSettings: obj({
    config_version: str('2026-11-05.3', { description: 'Naik otomatis setiap ada perubahan konfigurasi (pengaturan, checklist P2H, kategori biaya)' }),
    languages: arr(enumOf(['id', 'en', 'zh'])),
    default_language: enumOf(['id', 'en', 'zh']),
    modules: obj({
      route_tracking: bool(false), receipt_ocr: bool(true), odometer_ocr: bool(true), travel_allowance: bool(true), incident_report: bool(false),
    }, undefined, { description: 'Fitur yang diaktifkan di aplikasi driver' }),
    photo_rules: obj({
      loading: obj({ min: int(2), max: int(10) }),
      unloading: obj({ min: int(1), max: int(10) }),
      delivery_note_pages: obj({ min: int(1), max: int(5) }),
      p2h_body: obj({ required_sides: arr(enumOf(['depan', 'kanan', 'kiri', 'belakang'])) }),
    }),
    p2h: obj({ frequency: enumOf(['daily_per_unit']), valid_until_local: str('23:59', { description: 'Jam P2H berakhir setiap hari (WIB)' }) }),
    correction_reason_required: bool(true, { description: 'Koreksi hasil OCR wajib disertai alasan' }),
    document_prefix: str('DO-', { description: 'Teks di depan nomor DO baru: <document_prefix><nomor urut min. 4 digit>, mis. DO-0145. Default "DO-".' }),
    branding: obj({
      app_name: nullable(str('Logistik Maju', { description: 'Nama aplikasi di dalam layar. Kosong = pakai client_name.' })),
      tagline: nullable(str('Antar Tepat Waktu')),
      logo_url: nullable(str('https://api.contoh.co.id/storage/branding/maju/logo.png', { format: 'uri', description: 'Logo (latar terang)' })),
      logo_dark_url: nullable(str('https://api.contoh.co.id/storage/branding/maju/logo-dark.png', { format: 'uri', description: 'Logo untuk tema gelap' })),
      icon_url: nullable(str('https://api.contoh.co.id/storage/branding/maju/icon.png', { format: 'uri', description: 'Ikon persegi' })),
      colors: obj({
        primary: str('#0B3C8C', { description: 'Format #RRGGBB, selalu huruf besar di respons' }),
        secondary: str('#6BB33B'),
        accent: str('#F5A623'),
        on_primary: str('#FFFFFF', { description: 'Warna teks/ikon di atas warna primer' }),
      }),
      support: obj({ label: str('Hubungi admin'), phone: nullable(str('0812-3456-7890')) }),
    }, undefined, { description: 'Tampilan merek perusahaan ini; aplikasi membacanya saat berjalan (warna dan logo), jadi tidak perlu rilis aplikasi baru.' }),
  }),
  AdminAiSettings: obj({
    enabled: bool(true, { description: 'AI_ENABLED di server. Bila false, pengecekan AI tidak dijalankan walau API key sudah terisi' }),
    configured: bool(true, { description: 'API key OpenAI client ini sudah terisi' }),
    key_hint: nullable(str('…WXYZ', { description: '4 karakter terakhir API key. API key sendiri tidak pernah dikembalikan' })),
    model: str('gpt-4o-mini', { description: 'Model pembaca gambar yang dipakai server' }),
    updated_at: nullable(dt()),
    updated_by: nullable(obj({ id: str('9b4e2c71-3d58-4a06-8f12-6c0e7d5a1b94'), name: nullable(str('Admin OGO')) })),
  }),
  AdminAiSettingsUpdate: obj({
    api_key: nullable(str('sk-proj-AbCdEf0123456789xyz', { description: 'API key OpenAI milik client ini (sk-..., tanpa spasi). null = hapus key' })),
  }, ['api_key']),
  AdminAiCheck: obj({
    configured: bool(true),
    valid: nullable(bool(true, { description: 'true = diterima OpenAI; false = belum diisi atau ditolak; null = belum bisa dipastikan (OpenAI tidak terjangkau atau batas pemakaian)' })),
    reason: nullable(enumOf(['belum_diisi', 'ditolak', 'ai_rate_limited', 'ai_unavailable', 'ai_timeout'], 'ditolak', { description: 'Alasan bila valid bukan true' })),
    message: str('API key OpenAI ditolak. Periksa API key client.', { description: 'Hanya ada bila valid bukan true dan ada penjelasan' }),
  }, ['configured', 'valid']),
  AdminSettingsUpdate: obj({
    languages: arr(enumOf(['id', 'en', 'zh'])),
    default_language: enumOf(['id', 'en', 'zh']),
    modules: obj({
      route_tracking: bool(false), receipt_ocr: bool(false), odometer_ocr: bool(true), travel_allowance: bool(true), incident_report: bool(false),
    }, undefined, { description: 'Boleh sebagian: hanya flag yang dikirim yang berubah' }),
    photo_rules: obj({
      loading: obj({ min: int(1), max: int(5) }, undefined, { description: 'Boleh sebagian (min saja / max saja); min tidak boleh melebihi max' }),
      unloading: obj({ min: int(1), max: int(10) }),
      delivery_note_pages: obj({ min: int(1), max: int(5) }),
      p2h_body: obj({ required_sides: arr(enumOf(['depan', 'kanan', 'kiri', 'belakang']), { description: 'Sisi foto badan yang wajib saat P2H (minimal satu)' }) }),
    }, undefined, { description: 'Boleh sebagian per kelompok' }),
    p2h: obj({ frequency: enumOf(['daily_per_unit']), valid_until_local: str('18:30') }),
    correction_reason_required: bool(false),
    document_prefix: str('SJ/2026/', {
      minLength: 1,
      maxLength: 20,
      pattern: '^[A-Za-z0-9 ._/-]+$',
      description: 'Prefix nomor DO baru (huruf, angka, spasi, ".", "_", "/", "-"). Hanya berlaku untuk DO yang dibuat sesudahnya; nomor urut tetap berlanjut.',
    }),
    branding: obj({
      app_name: nullable(str('Logistik Maju', { description: 'null = kosongkan' })),
      tagline: nullable(str('Antar Tepat Waktu')),
      logo_url: nullable(str('https://api.contoh.co.id/storage/branding/maju/logo.png', { format: 'uri' })),
      logo_dark_url: nullable(str('https://api.contoh.co.id/storage/branding/maju/logo-dark.png', { format: 'uri' })),
      icon_url: nullable(str('https://api.contoh.co.id/storage/branding/maju/icon.png', { format: 'uri' })),
      colors: obj({
        primary: str('#0B3C8C'), secondary: str('#6BB33B'), accent: str('#F5A623'), on_primary: str('#FFFFFF'),
      }, undefined, { description: 'Boleh sebagian. Format #RRGGBB. Warna tidak bisa dikosongkan.' }),
      support: obj({ label: str('Hubungi admin'), phone: nullable(str('0812-3456-7890')) }, undefined, { description: 'Boleh sebagian' }),
    }, undefined, { description: 'Merek perusahaan. Boleh sebagian: hanya yang dikirim yang berubah (colors dan support digabung per field).' }),
  }),

  // ---------- Push notification (FCM data payload, bukan endpoint) ----------
  PushDoAssigned: {
    ...obj({
      type: enumOf(['do_assigned']),
      delivery_order_id: str('2fb9f57e-a6e7-4890-b957-30261a15b471'),
      no: str('DO-0144'),
      assigned_at: dt(),
    }),
    example: ex('05-delivery-orders/PUSH.do-assigned.payload.json')
  },
  PushP2hRecheckRequested: {
    ...obj({
      type: enumOf(['p2h_recheck_requested']),
      unit_id: str('fc06e493-e9c6-429b-9529-bc07084818ee'),
      unit_plate: str('B 9123 KZ'),
      requested_by: str('f1b7c36a-1eae-4b3b-8ee4-9434fcfeff2f'),
      requested_at: dt(),
      note: str('Lampu sein sudah diganti, mohon P2H ulang'),
      previous_p2h_id: str('d6c681e9-d765-40c1-9b35-f8ad7f695743'),
    }),
    example: ex('04-p2h/PUSH.p2h-recheck-requested.payload.json')
  },
}

const errorResponse = (description, examples) => ({
  description,
  content: {
    'application/json': {
      schema: ref('Error'),
      examples: Object.fromEntries(Object.entries(examples).map(([k, v]) => [k, { value: ex(v) }])),
    },
  },
})

const responses = {
  Unauthorized: errorResponse('Token tidak ada / tidak valid / kedaluwarsa', {
    UNAUTHORIZED: '00-common/error.unauthorized.json',
    TOKEN_EXPIRED: '00-common/error.token-expired.json',
  }),
  ValidationError: errorResponse('Validasi gagal (422)', { VALIDATION_ERROR: '00-common/error.validation.json' }),
  P2HRequired: errorResponse('Unit belum P2H hari ini (409)', { P2H_REQUIRED: '00-common/error.p2h-required.json' }),
  DuplicateReceipt: errorResponse('Struk sudah dipakai (409)', { DUPLICATE_RECEIPT: '00-common/error.duplicate-receipt.json' }),
  NotFound: {
    description: 'Data tidak ditemukan',
    content: {
      'application/json': {
        schema: ref('Error'),
        example: { success: false, error: { code: 'NOT_FOUND', message: 'Data tidak ditemukan.', http_status: 404 } },
      },
    },
  },
  InvalidState: {
    description: 'Langkah tidak sesuai status DO (409)',
    content: {
      'application/json': {
        schema: ref('Error'),
        example: {
          success: false,
          error: {
            code: 'INVALID_STATE',
            message: 'Langkah ini tidak bisa dilakukan pada status DO saat ini.',
            http_status: 409,
            details: { current_status: 'assigned', expected_next_step: 'loading' },
          },
        },
      },
    },
  },
  RateLimited: {
    description: 'Terlalu banyak request',
    content: {
      'application/json': {
        schema: ref('Error'),
        example: { success: false, error: { code: 'RATE_LIMITED', message: 'Terlalu banyak permintaan, coba lagi nanti.', http_status: 429 } },
      },
    },
  },
  InternalError: {
    description: 'Kesalahan server',
    content: {
      'application/json': {
        schema: ref('Error'),
        example: { success: false, error: { code: 'INTERNAL_ERROR', message: 'Terjadi kesalahan pada server.', http_status: 500 } },
      },
    },
  },
}

const parameters = {
  DeliveryOrderId: {
    name: 'id', in: 'path', required: true, description: 'ID delivery order', schema: { type: 'string', example: '2fb9f57e-a6e7-4890-b957-30261a15b471' },
  },
  MediaId: {
    name: 'id', in: 'path', required: true, description: 'ID foto (hasil POST /media)', schema: { type: 'string', example: 'fc06e493-e9c6-429b-9529-bc07084818ee' },
  },
  AiCheckId: {
    name: 'id', in: 'path', required: true, description: 'ID pengecekan AI', schema: { type: 'string', example: '0c9d1e52-7a34-4b86-9d10-2f5e8a3b6c71' },
  },
  UnitId: {
    name: 'unitId', in: 'path', required: true, description: 'ID unit (kendaraan)', schema: { type: 'string', example: 'fc06e493-e9c6-429b-9529-bc07084818ee' },
  },
}

module.exports = {
  schemas,
  responses,
  parameters,
  securitySchemes: {
    bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    internalKey: {
      type: 'apiKey', in: 'header', name: 'X-Internal-Key', description: 'Kunci antar-layanan (INTERNAL_PROVISIONING_KEY), dipegang saas-worker',
    },
  },
}
