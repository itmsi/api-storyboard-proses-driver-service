const findById = (db, id) => db('ai_checks').where({ id }).first()

const findByMedia = (db, mediaId) => db('ai_checks').where({ media_id: mediaId }).first()

/** Foto milik driver (user) ini yang belum dihapus. */
const findOwnedMedia = (db, userId, mediaId) => db('media')
  .where({ id: mediaId, captured_by: userId, is_delete: false })
  .first('id', 'kind', 'storage_key')

/** Jumlah permintaan driver ini sejak waktu tertentu (pembatas biaya per jam). */
const countRequestedSince = async (db, userId, since) => {
  const [{ count }] = await db('ai_checks').where({ requested_by: userId }).where('created_at', '>=', since).count('id as count')
  return Number(count)
}

const insert = async (db, row) => {
  const [created] = await db('ai_checks').insert(row).returning('*')
  return created
}

/** Foto milik siapa (untuk hak baca hasil pengecekan). */
const findMediaOwner = (db, mediaId) => db('media').where({ id: mediaId }).first('captured_by')

/**
 * Pekerjaan yang diminta ulang kembali ke antrean dari awal. Hanya dari status yang diizinkan (failed; done bila regenerate), supaya
 * pekerjaan yang sedang antre/berjalan tidak ditimpa. Hasil lama (result/raw dan nilai di bacaan) tetap sampai hasil baru berhasil.
 */
const requeue = async (db, id, userId, fromStatuses = ['failed']) => {
  const [row] = await db('ai_checks').where({ id }).whereIn('status', fromStatuses).update({
    status: 'queued',
    attempts: 0,
    error_code: null,
    error_message: null,
    started_at: null,
    finished_at: null,
    requested_by: userId,
    updated_by: userId,
  })
    .returning('*')
  return row
}

/** Foto untuk worker (tanpa cek pemilik): kuncinya di penyimpanan dan apakah sudah dihapus. */
const findMedia = (db, mediaId) => db('media').where({ id: mediaId }).first('id', 'kind', 'storage_key', 'is_delete')

/**
 * Ambil pekerjaan untuk diproses: hanya yang masih queued/processing, sehingga pesan ganda atau pekerjaan yang sudah selesai
 * tidak diproses dua kali. Menambah attempts. null = bukan giliran proses ini.
 */
const claim = async (db, id) => {
  const [row] = await db('ai_checks').where({ id }).whereIn('status', ['queued', 'processing']).update({
    status: 'processing',
    attempts: db.raw('attempts + 1'),
    started_at: db.fn.now(),
    finished_at: null,
  })
    .returning('*')
  return row || null
}

const finish = async (db, id, {
  result, raw, confidence, model, usage,
}) => db('ai_checks').where({ id }).update({
  status: 'done',
  result: JSON.stringify(result),
  raw: JSON.stringify(raw),
  confidence: confidence === null || confidence === undefined ? null : confidence,
  model,
  usage: usage ? JSON.stringify(usage) : null,
  error_code: null,
  error_message: null,
  finished_at: db.fn.now(),
})

/** Gagal sementara: kembali ke queued (dicoba ulang oleh antrean tunda), alasan terakhir tetap tercatat. */
const markRetry = (db, id, { code, message }) => db('ai_checks').where({ id }).update({
  status: 'queued', error_code: code, error_message: message,
})

const markFailed = (db, id, { code, message }) => db('ai_checks').where({ id }).update({
  status: 'failed', error_code: code, error_message: message, finished_at: db.fn.now(),
})

/** Pekerjaan yang tak bergerak sejak waktu tertentu (pesan hilang, atau worker mati saat memproses). */
const findStale = (db, before) => db('ai_checks')
  .whereIn('status', ['queued', 'processing'])
  .where('updated_at', '<', before)
  .orderBy('updated_at')
  .limit(200)
  .select('id', 'status')

/** Segarkan updated_at supaya pekerjaan yang baru diterbitkan ulang tidak langsung dianggap tersangkut lagi. */
const touch = (db, id) => db('ai_checks').where({ id }).update({ updated_at: db.fn.now() })

module.exports = {
  findById, findByMedia, findOwnedMedia, findMediaOwner, countRequestedSince, insert, requeue, findMedia, claim, finish, markRetry, markFailed, findStale, touch,
}
