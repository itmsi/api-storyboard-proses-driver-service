const storage = require('../../utils/storage')
const { toWib } = require('../../utils/date')
const { auditFields } = require('../../utils/audit')

/** Baris tabel media -> objek Media kontrak. */
const serializeMedia = (row) => ({
  id: row.id,
  kind: row.kind,
  url: storage.publicUrl(row.storage_key),
  thumb_url: row.thumb_key ? storage.publicUrl(row.thumb_key) : null,
  source: row.source,
  captured_at: toWib(row.captured_at),
  server_received_at: toWib(row.server_received_at),
  gps: row.lat === null ? null : {
    lat: Number(row.lat),
    lng: Number(row.lng),
    ...(row.gps_accuracy_m === null ? {} : { accuracy_m: Number(row.gps_accuracy_m) }),
  },
  captured_by: row.captured_by,
  sha256: row.sha256,
  ...(row.side ? { side: row.side } : {}),
  ...auditFields(row),
})

module.exports = { serializeMedia }
