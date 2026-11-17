const { ensureDefaultRoles } = require('../tenant/default-roles')

// Modul hak driver baru driver_ai_check (minta dan lihat pengecekan foto dengan AI). Role Driver bawaan yang sudah ada hanya
// ditambahi modul yang belum tercatat (perubahan admin pada modul lain tidak ditimpa); role driver buatan admin tidak disentuh,
// jadi admin yang memberikannya. Idempoten.
exports.up = async (knex) => {
  await ensureDefaultRoles(knex)
}

exports.down = async (knex) => {
  await knex.raw("UPDATE roles SET permissions = permissions - 'driver_ai_check' WHERE user_type = 'driver' AND jsonb_exists(permissions, 'driver_ai_check')")
}
