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
  type: 'object', properties, ...(required ? { required } : {}), ...extra,
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
const DO_STATUS = ['assigned', 'accepted', 'loading', 'in_transit', 'handover', 'completed', 'cancelled']
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

  // ---------- Internal ----------
  MigrationResult: obj({
    client_code: str('ACME'),
    batch: nullable(int(1, { description: 'Nomor batch migrasi' })),
    applied: arr(str('20261110000200_create_auth_tables.js'), { description: 'Migrasi yang baru dijalankan; kosong jika sudah terbaru' }),
  }),
  MigrationStatus: obj({
    client_code: str('ACME'),
    up_to_date: bool(true),
    current_version: nullable(str('20261110000600_create_p2h_tables.js')),
    applied_count: int(7),
    pending: arr(str('20261110000700_create_delivery_orders.js'), { description: 'Migrasi yang belum dijalankan' }),
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
        obj({ driver: ref('DriverRef') }),
        obj({
          admin: obj({
            id: str('4f1a8c52-9d3e-4b7a-8e61-2c5d7f90a1b3'), username: str('budi.admin'), name: str('Budi Admin'), email: str('budi@contoh.co.id'),
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
    side: { ...enumOf(['depan', 'kanan', 'kiri', 'belakang']), description: 'Wajib jika kind = p2h_body' },
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
  DeliveryOrder: obj({
    id: str('2fb9f57e-a6e7-4890-b957-30261a15b471'),
    no: str('DO-0144'),
    status: enumOf(DO_STATUS),
    assigned_at: dt('2026-11-05T06:55:00+07:00'),
    assigned_by: str('f1b7c36a-1eae-4b3b-8ee4-9434fcfeff2f'),
    unit: ref('UnitRef'),
    driver: ref('DriverRef'),
    origin: obj({
      name: str('Gudang Cakung'), address: str('[ALAMAT GUDANG]'), gps: ref('Gps'), load_time: dt('2026-11-05T13:00:00+07:00'),
    }),
    destination: obj({
      name: str('PT Contoh Jaya'),
      city: str('Karawang'),
      address: str('[ALAMAT LENGKAP TUJUAN]'),
      gps: ref('Gps'),
      operating_hours: str('08:00-17:00'),
      pic: obj({ name: str('[NAMA PIC]'), phone: str('[NO_HP_PIC]') }),
      maps_url: str('https://maps.google.com/?q=-6.30,107.29'),
    }),
    cargo: obj({ description: str('4 palet'), quantity: num(4), unit: str('palet') }),
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
    can_accept: bool(true, { description: 'false jika P2H belum ada / unit tidak layak / masih ada DO berjalan. Hanya untuk DO assigned' }),
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
  }),
  HistoryMeta: obj({
    from: date('2026-11-01'),
    to: date('2026-11-05'),
    limit: int(20),
    next_cursor: nullable(str('eyJpZCI6ImRvXzAxMzEifQ==')),
    has_more: bool(true),
    summary: obj({ do_count: int(4), distance_km: num(167), expense_total: money(679500) }),
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
    last_login_at: nullable(dt('2026-11-05T07:00:00+07:00')),
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
    license: obj({
      no: nullable(str('1234-5678')), type: nullable(str('B2 Umum')), expires_on: nullable(date('2028-05-01')),
    }),
    unit_today: nullable(obj({ id: str('fc06e493-e9c6-429b-9529-bc07084818ee'), plate: str('B 9123 KZ') })),
    last_login_at: nullable(dt('2026-11-05T07:00:00+07:00')),
    locked: bool(false, { description: 'true jika akun terkunci sementara karena salah password' }),
    locked_until: nullable(dt('2026-11-05T07:15:00+07:00')),
    ...auditProps,
  }),
  AdminDriverDetail: {
    allOf: [ref('AdminDriver'), obj({
      active_do: nullable(obj({ id: str('2fb9f57e-a6e7-4890-b957-30261a15b471'), no: str('DO-0144'), status: enumOf(DO_STATUS, 'in_transit') })),
      failed_login_count: int(0),
      initial_password: str('Kp7mQ3xZ9t', { description: 'Hanya di response pembuatan, dan hanya jika `password` tidak diisi' }),
    })],
  },
  AdminDriverCreate: obj({
    name: str('Budi Santoso'),
    phone: nullable(str('0812-3456-7890', { description: 'Diubah ke format +62…; unik antar akun' })),
    code: str('DRV-0100', { description: 'Kosong = otomatis (DRV-0001, DRV-0002, …). Kode yang pernah dipakai tidak bisa dipakai ulang' }),
    password: str('<password>', { format: 'password', description: 'Kosong = dibuatkan password sementara' }),
    license_no: nullable(str('1234-5678')),
    license_type: nullable(str('B2 Umum')),
    license_expires_on: nullable(date('2028-05-01')),
  }, ['name']),
  AdminDriverUpdate: obj({
    name: str('Budi Santoso'),
    phone: nullable(str('0812-3456-7890')),
    status: { ...enumOf(['active', 'suspended']), description: 'suspended = tidak bisa login dan sesinya dicabut' },
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
    password: str('<password>', { format: 'password', description: 'Kosong = dibuatkan password sementara' }),
  }, ['name', 'username', 'email']),
  AdminUserUpdate: obj({
    name: str('Budi Admin'),
    email: str('budi@contoh.co.id'),
    phone: nullable(str('0812-3456-7890')),
    status: { ...enumOf(['active', 'suspended']), description: 'Tidak bisa menonaktifkan diri sendiri' },
  }),
  BootstrapAdminRequest: obj({
    username: str('owner'),
    name: str('Pemilik Perusahaan'),
    email: str('owner@contoh.co.id'),
    password: str('<password>', { format: 'password', description: 'Minimal 8 karakter, mengandung huruf dan angka' }),
  }, ['username', 'name', 'email', 'password']),
  BootstrapAdminResponse: obj({
    created: bool(true, { description: 'false jika admin dengan username itu sudah ada (tidak ada yang diubah)' }),
    admin: obj({ id: str('4f1a8c52-9d3e-4b7a-8e61-2c5d7f90a1b3'), username: str('owner') }),
  }),

  // ---------- Admin - Master Data ----------
  AdminUnitType: obj({
    id: str('3b9e6f10-5c4d-4a72-8e1b-7d2c9a0f4e55'),
    code: str('CDD_BAK'),
    name: str('CDD Bak'),
    max_load_kg: nullable(int(2500)),
    unit_count: int(3, { description: 'Jumlah unit aktif bertipe ini' }),
    ...auditProps,
  }),
  AdminUnitTypeCreate: obj({
    code: str('CDD_BAK', { description: 'Huruf besar/angka/`_`/`-` (2-30), unik, tidak bisa diubah' }),
    name: str('CDD Bak'),
    max_load_kg: nullable(int(2500)),
  }, ['code', 'name']),
  AdminUnitTypeUpdate: obj({ name: str('CDD Bak'), max_load_kg: nullable(int(2500)) }),
  AdminUnit: obj({
    id: str('fc06e493-e9c6-429b-9529-bc07084818ee'),
    plate: str('B 9123 KZ'),
    type: obj({ id: str('3b9e6f10-5c4d-4a72-8e1b-7d2c9a0f4e55'), code: str('CDD_BAK'), name: str('CDD Bak') }),
    brand: nullable(str('Mitsubishi')),
    year: nullable(int(2022)),
    status: enumOf(['active', 'maintenance', 'inactive']),
    last_odometer_km: nullable(int(45278)),
    stnk_expires_on: nullable(date('2027-03-15')),
    kir_expires_on: nullable(date('2026-12-01')),
    stnk_expired: bool(false),
    kir_expired: bool(false),
    ...auditProps,
  }),
  AdminUnitCreate: obj({
    plate: str('b-9123-kz', { description: 'Dinormalisasi menjadi "B 9123 KZ"; unik di antara unit aktif' }),
    unit_type_id: str('3b9e6f10-5c4d-4a72-8e1b-7d2c9a0f4e55'),
    brand: nullable(str('Mitsubishi')),
    year: nullable(int(2022)),
    last_odometer_km: nullable(int(45278)),
    status: enumOf(['active', 'maintenance', 'inactive'], 'active'),
    stnk_expires_on: nullable(date('2027-03-15')),
    kir_expires_on: nullable(date('2026-12-01')),
  }, ['plate', 'unit_type_id']),
  AdminUnitUpdate: obj({
    plate: str('B 9123 KZ'),
    unit_type_id: str('3b9e6f10-5c4d-4a72-8e1b-7d2c9a0f4e55'),
    brand: nullable(str('Mitsubishi')),
    year: nullable(int(2022)),
    last_odometer_km: nullable(int(45278)),
    status: enumOf(['active', 'maintenance', 'inactive']),
    stnk_expires_on: nullable(date('2027-03-15')),
    kir_expires_on: nullable(date('2026-12-01')),
  }),
  AdminCustomer: obj({
    id: str('6a1d4e72-8b35-4c09-9f27-0e5b3d8a1c64'),
    code: str('CUST-001'),
    name: str('PT Contoh Jaya'),
    phone: nullable(str('021-5550100')),
    email: nullable(str('info@contohjaya.co.id')),
    location_count: int(2, { description: 'Jumlah lokasi aktif milik customer ini' }),
    ...auditProps,
  }),
  AdminCustomerCreate: obj({
    code: str('CUST-001', { description: 'Huruf besar/angka/`_`/`-` (2-30), unik, tidak bisa diubah' }),
    name: str('PT Contoh Jaya'),
    phone: nullable(str('021-5550100')),
    email: nullable(str('info@contohjaya.co.id')),
  }, ['code', 'name']),
  AdminCustomerUpdate: obj({ name: str('PT Contoh Jaya'), phone: nullable(str('021-5550100')), email: nullable(str('info@contohjaya.co.id')) }),
  AdminLocation: obj({
    id: str('d84f2a61-7c93-4e05-a1b8-5f3e9c0d7a22'),
    type: enumOf(['warehouse', 'depot', 'customer_site']),
    name: str('Gudang Cakung'),
    address: str('Jl. Raya Cakung Cilincing, Jakarta Timur'),
    city: nullable(str('Cakung')),
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
    lat: nullable(num(-6.18)),
    lng: nullable(num(106.94)),
    geofence_radius_m: nullable(int(200)),
    operating_hours: nullable(str('08:00-17:00')),
    pic_name: nullable(str('Pak Rudi')),
    pic_phone: nullable(str('+628111222333')),
  }),

  // ---------- Admin - Delivery Order & Penugasan ----------
  AdminDeliveryOrder: obj({
    id: str('2fb9f57e-a6e7-4890-b957-30261a15b471'),
    no: str('DO-0145'),
    status: enumOf(DO_STATUS, 'assigned'),
    delivery_status: nullable(enumOf(DELIVERY_STATUS, 'terkirim_lengkap')),
    driver: obj({ id: str('952975ba-bcf9-4a57-ac3b-be20940d8b25'), code: str('DRV-0021'), name: str('Andi') }),
    unit: obj({ id: str('fc06e493-e9c6-429b-9529-bc07084818ee'), plate: str('B 9123 KZ'), type: str('CDD Bak') }),
    customer: nullable(obj({ id: str('6a1d4e72-8b35-4c09-9f27-0e5b3d8a1c64'), name: str('PT Contoh Jaya') })),
    route: str('Cakung → PT Contoh Jaya, Karawang'),
    origin: obj({ name: str('Gudang Cakung'), city: nullable(str('Cakung')) }),
    destination: obj({ name: str('PT Contoh Jaya'), city: nullable(str('Karawang')) }),
    planned_load_at: nullable(dt('2026-11-05T13:00:00+07:00')),
    assigned_at: dt('2026-11-05T06:55:00+07:00'),
    cargo: obj({ description: str('4 palet'), quantity: num(4), unit: str('palet') }),
    estimated_distance_km: nullable(num(70)),
    travel_allowance_amount: money(600000),
    expense_total: money(263500),
    odometer_start_km: nullable(int(45210)),
    odometer_end_km: nullable(int(45278)),
    distance_km: nullable(int(68)),
    accepted_at: nullable(dt()),
    started_at: nullable(dt()),
    completed_at: nullable(dt()),
    cancelled_at: nullable(dt()),
    cancel_reason: nullable(str('Pelanggan membatalkan pesanan')),
    ...auditProps,
  }),
  AdminDeliveryOrderDetail: {
    allOf: [ref('AdminDeliveryOrder'), obj({
      origin: obj({
        location_id: str('d84f2a61-7c93-4e05-a1b8-5f3e9c0d7a22'),
        name: str('Gudang Cakung'),
        address: str('Jl. Raya Cakung Cilincing, Jakarta Timur'),
        city: nullable(str('Cakung')),
        gps: nullable(obj({ lat: num(-6.18), lng: num(106.94) })),
      }, undefined, { description: 'Salinan alamat saat DO dibuat (tidak ikut berubah jika lokasi master diubah)' }),
      destination: obj({
        location_id: str('d84f2a61-7c93-4e05-a1b8-5f3e9c0d7a23'),
        name: str('PT Contoh Jaya'),
        address: str('Kawasan Industri KIIC, Karawang'),
        city: nullable(str('Karawang')),
        gps: nullable(obj({ lat: num(-6.3), lng: num(107.29) })),
        operating_hours: nullable(str('08:00-17:00')),
        pic: nullable(obj({ name: nullable(str('Pak Rudi')), phone: nullable(str('+628111222333')) })),
      }),
      travel_allowance: obj({ amount: money(600000), received_at: nullable(dt()) }),
      timeline: arr(obj({
        id: int(1),
        event: str('assigned', { description: 'assigned, updated, accepted, loaded, odometer_start, expense_added, handover, odometer_end, completed, cancelled' }),
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
          ocr: nullable(obj({ km: nullable(int(45210)), fuel_level: nullable(ref('FuelLevel')) })),
          correction_reason: nullable(str('Angka buram')),
        })),
        end: nullable(obj({
          km: int(45278),
          source: enumOf(['ocr', 'corrected']),
          fuel_level: nullable(ref('FuelLevel')),
          captured_at: dt(),
          ocr: nullable(obj({ km: nullable(int(45278)), fuel_level: nullable(ref('FuelLevel')) })),
          correction_reason: nullable(str('Angka buram')),
        })),
      }),
      expenses: arr(obj({
        id: str('5f0c2a9e-7d41-4b83-9e6a-1c8d3b4a5e70'),
        category: str('tol'),
        label: str('Tol Cikampek'),
        amount: money(54500),
        has_proof: bool(false),
        corrected: bool(false),
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
    planned_load_at: nullable(dt('2026-11-05T13:00:00+07:00')),
    cargo: obj({ description: str('4 palet'), quantity: num(4), unit: str('palet') }, ['description', 'quantity', 'unit']),
    estimated_distance_km: nullable(num(70)),
    travel_allowance_amount: money(600000),
  }, ['driver_id', 'unit_id', 'origin_location_id', 'destination_location_id', 'cargo']),
  AdminDeliveryOrderUpdate: obj({
    driver_id: str('952975ba-bcf9-4a57-ac3b-be20940d8b25'),
    unit_id: str('fc06e493-e9c6-429b-9529-bc07084818ee'),
    origin_location_id: str('d84f2a61-7c93-4e05-a1b8-5f3e9c0d7a22'),
    destination_location_id: str('d84f2a61-7c93-4e05-a1b8-5f3e9c0d7a23', { description: 'Mengganti tujuan memperbarui salinan alamat dan menurunkan ulang customer' }),
    customer_id: nullable(str('6a1d4e72-8b35-4c09-9f27-0e5b3d8a1c64')),
    planned_load_at: nullable(dt('2026-11-05T13:00:00+07:00')),
    cargo: obj({ description: str('4 palet'), quantity: num(4), unit: str('palet') }, undefined, { description: 'Boleh sebagian (mis. hanya quantity)' }),
    estimated_distance_km: nullable(num(70)),
    travel_allowance_amount: money(600000),
  }),
  CancelDeliveryOrderRequest: obj({ reason: str('Pelanggan membatalkan pesanan', { description: '3-300 karakter' }) }, ['reason']),
  UnitAssignment: obj({
    id: str('9b4e2c71-3d58-4a06-8f12-6c0e7d5a1b94'),
    work_date: date('2026-11-05'),
    driver: obj({ id: str('952975ba-bcf9-4a57-ac3b-be20940d8b25'), code: str('DRV-0021'), name: str('Andi') }),
    unit: obj({ id: str('fc06e493-e9c6-429b-9529-bc07084818ee'), plate: str('B 9123 KZ'), type: str('CDD Bak') }),
    ...auditProps,
  }),
  UnitAssignmentRequest: obj({
    driver_id: str('952975ba-bcf9-4a57-ac3b-be20940d8b25'),
    unit_id: str('fc06e493-e9c6-429b-9529-bc07084818ee'),
    work_date: date('2026-11-05'),
  }, ['driver_id', 'unit_id', 'work_date']),

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
  }),
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
      type: 'apiKey', in: 'header', name: 'X-Internal-Key', description: 'Kunci antar-layanan (INTERNAL_API_KEY) untuk project manage company',
    },
  },
}
