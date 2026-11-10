const knex = require('knex')
const knexfile = require('./knexfile')

// Koneksi dibuat lazy: aplikasi tetap bisa start walau DB belum siap,
// status DB dilaporkan lewat GET /health.
const db = knex(knexfile)

module.exports = db
