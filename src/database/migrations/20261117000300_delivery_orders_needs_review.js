// Penanda "perlu dilihat" di tingkat DO (docs/PLAN-OCR.md langkah 7). Daftar DO membaca satu tabel saja (tanpa join atau hitung per baris),
// jadi penanda dari bacaan odometer dan biaya diringkas ke delivery_orders.needs_review. Trigger menjaganya selalu sinkron dari mana pun
// bacaan/biaya berubah (API, worker AI, atau perubahan langsung di database).
//
// needs_review DO = ada bacaan odometer yang needs_review, atau ada biaya yang needs_review dan belum dibatalkan (voided).

const FUNCTION_SQL = `
CREATE OR REPLACE FUNCTION refresh_do_needs_review() RETURNS trigger AS $$
DECLARE
  target uuid;
  flag boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN target := OLD.delivery_order_id; ELSE target := NEW.delivery_order_id; END IF;
  SELECT EXISTS (SELECT 1 FROM odometer_readings WHERE delivery_order_id = target AND needs_review)
      OR EXISTS (SELECT 1 FROM expenses WHERE delivery_order_id = target AND needs_review AND voided_at IS NULL)
    INTO flag;
  UPDATE delivery_orders SET needs_review = flag WHERE id = target AND needs_review IS DISTINCT FROM flag;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql
`

exports.up = async (knex) => {
  await knex.schema.alterTable('delivery_orders', (t) => {
    t.boolean('needs_review').notNullable().defaultTo(false)
  })
  await knex.raw('CREATE INDEX do_needs_review_idx ON delivery_orders (created_at DESC) WHERE needs_review')
  await knex.raw(FUNCTION_SQL)
  await knex.raw(`CREATE TRIGGER odometer_readings_needs_review AFTER INSERT OR DELETE OR UPDATE OF needs_review ON odometer_readings
    FOR EACH ROW EXECUTE FUNCTION refresh_do_needs_review()`)
  await knex.raw(`CREATE TRIGGER expenses_needs_review AFTER INSERT OR DELETE OR UPDATE OF needs_review, voided_at ON expenses
    FOR EACH ROW EXECUTE FUNCTION refresh_do_needs_review()`)

  // DO yang sudah punya bacaan bertanda
  await knex.raw(`UPDATE delivery_orders d SET needs_review = true
    WHERE EXISTS (SELECT 1 FROM odometer_readings o WHERE o.delivery_order_id = d.id AND o.needs_review)
       OR EXISTS (SELECT 1 FROM expenses e WHERE e.delivery_order_id = d.id AND e.needs_review AND e.voided_at IS NULL)`)
}

exports.down = async (knex) => {
  await knex.raw('DROP TRIGGER IF EXISTS expenses_needs_review ON expenses')
  await knex.raw('DROP TRIGGER IF EXISTS odometer_readings_needs_review ON odometer_readings')
  await knex.raw('DROP FUNCTION IF EXISTS refresh_do_needs_review()')
  await knex.raw('DROP INDEX IF EXISTS do_needs_review_idx')
  await knex.schema.alterTable('delivery_orders', (t) => {
    t.dropColumn('needs_review')
  })
}
