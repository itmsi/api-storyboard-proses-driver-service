// Status DO baru: onhold (ditahan admin). DO onhold tidak menahan hari kerja driver, sehingga driver yang sama boleh
// mendapat DO lain dengan unit berbeda pada tanggal yang sama. DO onhold bisa dilanjutkan (kembali assigned) atau dibatalkan.
// Idempoten (IF EXISTS / IF NOT EXISTS), aman bila sebagian sudah dijalankan manual.
exports.up = async (knex) => {
  await knex.raw('ALTER TABLE delivery_orders DROP CONSTRAINT IF EXISTS do_status_chk')
  await knex.raw(`ALTER TABLE delivery_orders ADD CONSTRAINT do_status_chk CHECK (status IN (
    'assigned', 'onhold', 'accepted', 'loading', 'in_transit', 'handover', 'completed', 'cancelled'))`)
  await knex.raw('ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS on_hold_at timestamptz')
  await knex.raw('ALTER TABLE delivery_orders ADD COLUMN IF NOT EXISTS on_hold_reason text')
}

exports.down = async (knex) => {
  const { rows } = await knex.raw("SELECT count(*)::int AS n FROM delivery_orders WHERE status = 'onhold'")
  if (rows[0].n) {
    throw new Error(`Masih ada ${rows[0].n} DO berstatus onhold. Lanjutkan (assigned) atau batalkan dulu sebelum rollback.`)
  }
  await knex.raw('ALTER TABLE delivery_orders DROP CONSTRAINT IF EXISTS do_status_chk')
  await knex.raw(`ALTER TABLE delivery_orders ADD CONSTRAINT do_status_chk CHECK (status IN (
    'assigned', 'accepted', 'loading', 'in_transit', 'handover', 'completed', 'cancelled'))`)
  await knex.raw('ALTER TABLE delivery_orders DROP COLUMN IF EXISTS on_hold_reason')
  await knex.raw('ALTER TABLE delivery_orders DROP COLUMN IF EXISTS on_hold_at')
}
