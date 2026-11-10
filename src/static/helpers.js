/**
 * Helper penyusun dokumen OpenAPI.
 * Contoh request/response diambil dari src/static/examples (fixture kontrak OGO Driver),
 * jadi cukup ubah file JSON di sana jika kontrak berubah.
 */
const path = require('path')

// eslint-disable-next-line global-require, import/no-dynamic-require
const ex = (file) => require(path.join(__dirname, 'examples', file))

const ref = (name) => ({ $ref: `#/components/schemas/${name}` })

/** Envelope sukses { success, data, meta? } */
const envelope = (dataSchema, metaSchema) => ({
  type: 'object',
  required: ['success', 'data'],
  properties: {
    success: { type: 'boolean', example: true },
    data: dataSchema,
    ...(metaSchema ? { meta: metaSchema } : {}),
  },
})

/**
 * Response JSON dengan satu atau beberapa contoh.
 * examples: { namaContoh: 'path/file.json' } atau string path tunggal
 */
const jsonResponse = (description, schema, examples) => {
  const content = { schema }
  if (typeof examples === 'string') {
    content.example = ex(examples)
  } else if (examples) {
    content.examples = Object.fromEntries(
      Object.entries(examples).map(([name, file]) => [name, { summary: name, value: ex(file) }])
    )
  }
  return { description, content: { 'application/json': content } }
}

const jsonBody = (schema, examples, required = true) => {
  const res = jsonResponse('', schema, examples)
  return { required, content: res.content }
}

const errorRef = (name) => ({ $ref: `#/components/responses/${name}` })

/** Error standar yang berlaku untuk endpoint ber-token */
const authErrors = {
  401: errorRef('Unauthorized'),
  429: errorRef('RateLimited'),
  500: errorRef('InternalError'),
}

const pathParam = (name, description, example) => ({
  name, in: 'path', required: true, description, schema: { type: 'string', example },
})

const secured = [{ bearerAuth: [] }]

module.exports = {
  ex, ref, envelope, jsonResponse, jsonBody, errorRef, authErrors, pathParam, secured,
}
