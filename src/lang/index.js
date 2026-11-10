/**
 * Pesan error per bahasa, dipilih dari header Accept-Language (id | en | zh).
 * Kunci = kode error di src/utils/errors.js.
 */
const config = require('../config')

const messages = {
  id: {
    BAD_REQUEST: 'Permintaan tidak valid.',
    VALIDATION_ERROR: 'Data tidak lengkap.',
    UNAUTHORIZED: 'Sesi berakhir, silakan masuk lagi.',
    TOKEN_EXPIRED: 'Sesi kedaluwarsa, memperbarui sesi…',
    INVALID_CREDENTIALS: 'No. HP / ID atau kata sandi salah.',
    ACCOUNT_LOCKED: 'Akun dikunci sementara karena terlalu banyak percobaan masuk.',
    FORBIDDEN: 'Anda tidak punya akses ke data ini.',
    NOT_FOUND: 'Data tidak ditemukan.',
    ROUTE_NOT_FOUND: 'Endpoint tidak ditemukan.',
    CONFLICT: 'Data bentrok dengan kondisi saat ini.',
    INVALID_STATE: 'Langkah ini tidak bisa dilakukan pada status DO saat ini.',
    P2H_REQUIRED: 'Unit belum di-P2H hari ini. DO baru bisa diterima setelah P2H.',
    DUPLICATE_RECEIPT: 'Struk ini sudah pernah dipakai di DO lain.',
    DO_LOCKED: 'DO sudah selesai dan dikunci.',
    PAYLOAD_TOO_LARGE: 'Ukuran file terlalu besar.',
    UNSUPPORTED_MEDIA_TYPE: 'Tipe file tidak didukung.',
    RATE_LIMITED: 'Terlalu banyak permintaan, coba lagi nanti.',
    MAINTENANCE: 'Sistem sedang dalam pemeliharaan.',
    APP_UPDATE_REQUIRED: 'Versi aplikasi terlalu lama, silakan perbarui.',
    INTERNAL_ERROR: 'Terjadi kesalahan pada server.',
  },
  en: {
    BAD_REQUEST: 'Invalid request.',
    VALIDATION_ERROR: 'Incomplete data.',
    UNAUTHORIZED: 'Session ended, please sign in again.',
    TOKEN_EXPIRED: 'Session expired, refreshing session…',
    INVALID_CREDENTIALS: 'Phone / ID or password is incorrect.',
    ACCOUNT_LOCKED: 'Account temporarily locked due to too many sign-in attempts.',
    FORBIDDEN: 'You do not have access to this data.',
    NOT_FOUND: 'Data not found.',
    ROUTE_NOT_FOUND: 'Endpoint not found.',
    CONFLICT: 'Data conflicts with the current state.',
    INVALID_STATE: 'This step is not allowed for the current DO status.',
    P2H_REQUIRED: 'Unit has not passed today\'s P2H. The DO can be accepted after P2H.',
    DUPLICATE_RECEIPT: 'This receipt has already been used on another DO.',
    DO_LOCKED: 'The DO is completed and locked.',
    PAYLOAD_TOO_LARGE: 'File is too large.',
    UNSUPPORTED_MEDIA_TYPE: 'Unsupported file type.',
    RATE_LIMITED: 'Too many requests, please try again later.',
    MAINTENANCE: 'System is under maintenance.',
    APP_UPDATE_REQUIRED: 'App version is too old, please update.',
    INTERNAL_ERROR: 'An internal server error occurred.',
  },
  zh: {
    BAD_REQUEST: '请求无效。',
    VALIDATION_ERROR: '数据不完整。',
    UNAUTHORIZED: '会话已结束，请重新登录。',
    TOKEN_EXPIRED: '会话已过期，正在刷新…',
    INVALID_CREDENTIALS: '手机号/ID 或密码错误。',
    ACCOUNT_LOCKED: '登录尝试次数过多，账户已暂时锁定。',
    FORBIDDEN: '您无权访问此数据。',
    NOT_FOUND: '未找到数据。',
    ROUTE_NOT_FOUND: '接口不存在。',
    CONFLICT: '数据与当前状态冲突。',
    INVALID_STATE: '当前运单状态不允许此操作。',
    P2H_REQUIRED: '车辆今日尚未完成 P2H 检查，完成后才能接单。',
    DUPLICATE_RECEIPT: '该收据已在其他运单中使用。',
    DO_LOCKED: '运单已完成并锁定。',
    PAYLOAD_TOO_LARGE: '文件过大。',
    UNSUPPORTED_MEDIA_TYPE: '不支持的文件类型。',
    RATE_LIMITED: '请求过多，请稍后再试。',
    MAINTENANCE: '系统维护中。',
    APP_UPDATE_REQUIRED: '应用版本过旧，请更新。',
    INTERNAL_ERROR: '服务器内部错误。',
  },
}

const SUPPORTED = Object.keys(messages)

const resolveLocale = (acceptLanguage) => {
  if (!acceptLanguage) return config.app.defaultLanguage
  const candidates = acceptLanguage
    .split(',')
    .map((part) => part.split(';')[0].trim().toLowerCase().slice(0, 2))
  return candidates.find((c) => SUPPORTED.includes(c)) || config.app.defaultLanguage
}

const t = (code, locale = config.app.defaultLanguage) => (
  messages[locale]?.[code]
  ?? messages[config.app.defaultLanguage]?.[code]
  ?? code
)

module.exports = { t, resolveLocale, SUPPORTED }
