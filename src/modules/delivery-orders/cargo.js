const Joi = require('joi')

/**
 * Muatan DO:
 *   cargo_type    : jenis muatan (teks bebas, opsional), mis. "Container"
 *   cargo_details : rincian bebas (opsional), [{ label, value }], mis. [{ "label": "No container", "value": "234242" }]
 * Dipakai bersama oleh validasi, penyimpanan, response (admin dan driver), dan pencarian.
 */
const MAX_DETAILS = 50

// value boleh dikirim sebagai angka; disimpan sebagai teks supaya formatnya tetap (mis. nomor diawali nol)
const detailValue = Joi.alternatives().try(
  Joi.string().trim().max(500).allow(''),
  Joi.number().custom((value) => String(value))
)

const detail = Joi.object({
  label: Joi.string().trim().min(1).max(100)
    .required(),
  value: detailValue.required(),
})

const schema = {
  cargo_type: Joi.string().trim().max(100).allow(null, ''),
  cargo_details: Joi.array().items(detail).max(MAX_DETAILS).allow(null),
}

/** Kolom DB dari body request; hanya field yang dikirim. "" / [] disimpan sebagai null. */
const toColumns = (body) => {
  const columns = {}
  if (body.cargo_type !== undefined) columns.cargo_type = body.cargo_type || null
  if (body.cargo_details !== undefined) {
    // jsonb: array JS harus di-stringify, kalau tidak driver pg mengirimnya sebagai array Postgres
    columns.cargo_details = body.cargo_details && body.cargo_details.length ? JSON.stringify(body.cargo_details) : null
  }
  return columns
}

/** Field muatan di response. cargo_details selalu array (kosong bila belum diisi). */
const serialize = (row) => ({
  cargo_type: row.cargo_type ?? null,
  cargo_details: Array.isArray(row.cargo_details) ? row.cargo_details : [],
})

/** Ekspresi SQL untuk pencarian: semua value rincian + jenis muatan, digabung jadi satu teks. */
const SEARCH_SQL = `concat_ws(' ', delivery_orders.cargo_type,
  (SELECT string_agg(e->>'value', ' ') FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(delivery_orders.cargo_details) = 'array' THEN delivery_orders.cargo_details ELSE '[]'::jsonb END) e))`

module.exports = {
  schema, toColumns, serialize, SEARCH_SQL, MAX_DETAILS,
}
