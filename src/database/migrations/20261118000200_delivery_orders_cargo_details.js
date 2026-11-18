// Muatan DO: tiga kolom tetap (cargo_description, cargo_quantity, cargo_unit) diganti
//   cargo_type    text, nullable   -> jenis muatan, mis. "Container", "Palet"
//   cargo_details jsonb, nullable  -> rincian bebas: [{ "label": "No container", "value": "234242" }, ...]
// Data lama tidak hilang: dipindah ke cargo_details sebagai [{ Barang }, { Jumlah }] sebelum kolomnya dihapus.

exports.up = async (knex) => {
  await knex.schema.alterTable('delivery_orders', (t) => {
    t.text('cargo_type')
    t.jsonb('cargo_details')
  })

  // "4.00" -> "4", "2.50" -> "2.5"
  await knex.raw(`UPDATE delivery_orders SET cargo_details = jsonb_build_array(
      jsonb_build_object('label', 'Barang', 'value', cargo_description),
      jsonb_build_object('label', 'Jumlah', 'value', trim(concat_ws(' ', rtrim(rtrim(cargo_quantity::text, '0'), '.'), cargo_unit)))
    )
    WHERE cargo_description IS NOT NULL`)

  await knex.schema.alterTable('delivery_orders', (t) => {
    t.dropColumn('cargo_description')
    t.dropColumn('cargo_quantity')
    t.dropColumn('cargo_unit')
  })
}

exports.down = async (knex) => {
  await knex.schema.alterTable('delivery_orders', (t) => {
    t.text('cargo_description')
    t.decimal('cargo_quantity', 12, 2)
    t.text('cargo_unit')
  })

  // Catatan: jangan pakai "?" di regex, knex.raw membacanya sebagai placeholder binding.
  // Kebalikan dari up (sebisanya): "Barang" -> description, "Jumlah" = "<angka> <satuan>" -> quantity + unit.
  // Rincian lain tidak punya tempat di skema lama; DO tanpa rincian diisi nilai pengganti agar NOT NULL terpenuhi.
  await knex.raw(`UPDATE delivery_orders d SET
      cargo_description = coalesce(
        (SELECT e->>'value' FROM jsonb_array_elements(d.cargo_details) e WHERE e->>'label' = 'Barang' LIMIT 1),
        (SELECT e->>'value' FROM jsonb_array_elements(d.cargo_details) e LIMIT 1),
        d.cargo_type,
        '-'),
      cargo_quantity = coalesce(
        (SELECT substring(e->>'value' FROM '^\\s*([0-9]+([.][0-9]+){0,1})')::numeric
          FROM jsonb_array_elements(d.cargo_details) e WHERE e->>'label' = 'Jumlah' LIMIT 1),
        1),
      cargo_unit = coalesce(
        (SELECT nullif(trim(regexp_replace(e->>'value', '^\\s*[0-9]+([.][0-9]+){0,1}', '')), '')
          FROM jsonb_array_elements(d.cargo_details) e WHERE e->>'label' = 'Jumlah' LIMIT 1),
        d.cargo_type,
        'unit')
    WHERE jsonb_typeof(d.cargo_details) = 'array' OR d.cargo_details IS NULL`)
  await knex.raw("UPDATE delivery_orders SET cargo_description = coalesce(cargo_description, '-'), cargo_quantity = coalesce(cargo_quantity, 1), cargo_unit = coalesce(cargo_unit, 'unit')")

  await knex.schema.alterTable('delivery_orders', (t) => {
    t.text('cargo_description').notNullable().alter()
    t.decimal('cargo_quantity', 12, 2).notNullable().alter()
    t.text('cargo_unit').notNullable().alter()
    t.dropColumn('cargo_type')
    t.dropColumn('cargo_details')
  })
}
