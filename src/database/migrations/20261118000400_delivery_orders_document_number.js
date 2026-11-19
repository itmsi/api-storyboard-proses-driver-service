// Nomor DO dipecah jadi dua bagian:
//   document_prefix  text   NOT NULL  -> teks di depan nomor (dari pengaturan `document_prefix`, mis. "DO-"); kolom lama `no` di-rename ke sini
//   document_number  bigint NOT NULL  -> nomor urut, auto increment dari sequence delivery_order_no_seq
// `no` tetap ada sebagai kolom GENERATED (prefix + nomor, minimal 4 digit: "DO-0144") supaya pencarian, urutan, relasi, dan
// response yang memakai nomor DO lengkap tidak berubah. `no` tidak bisa diisi manual.
//
// Data lama "DO-0144" -> document_prefix "DO-", document_number 144 (hasil `no` tetap "DO-0144").

const NO_SQL = `document_prefix || CASE WHEN length(document_number::text) >= 4 THEN document_number::text
  ELSE lpad(document_number::text, 4, '0') END`

exports.up = async (knex) => {
  await knex.raw('ALTER TABLE delivery_orders RENAME COLUMN no TO document_prefix')
  // Unik pindah ke nomor lengkap (`no` baru); prefix sendiri tentu tidak unik
  await knex.raw('ALTER TABLE delivery_orders DROP CONSTRAINT IF EXISTS delivery_orders_no_unique')
  await knex.raw('ALTER TABLE delivery_orders ADD COLUMN document_number bigint')

  // Pecah nomor lama: angka di ujung = document_number, sisanya = document_prefix
  await knex.raw(`UPDATE delivery_orders
    SET document_number = substring(document_prefix FROM '([0-9]+)$')::bigint,
        document_prefix = regexp_replace(document_prefix, '[0-9]+$', '')
    WHERE document_prefix ~ '[0-9]+$'`)
  // Nomor lama tanpa angka di ujung: prefix tetap, nomor diambilkan dari sequence
  await knex.raw("UPDATE delivery_orders SET document_number = nextval('delivery_order_no_seq') WHERE document_number IS NULL")

  // Sequence lanjut setelah nomor terbesar, supaya nomor baru tidak bentrok dengan data lama
  await knex.raw(`SELECT setval('delivery_order_no_seq',
    greatest((SELECT coalesce(max(document_number), 0) FROM delivery_orders), (SELECT last_value FROM delivery_order_no_seq), 1))`)

  await knex.raw(`ALTER TABLE delivery_orders
    ALTER COLUMN document_number SET DEFAULT nextval('delivery_order_no_seq'),
    ALTER COLUMN document_number SET NOT NULL`)
  await knex.raw('ALTER SEQUENCE delivery_order_no_seq OWNED BY delivery_orders.document_number')

  await knex.raw(`ALTER TABLE delivery_orders ADD COLUMN no text GENERATED ALWAYS AS (${NO_SQL}) STORED`)
  await knex.raw('ALTER TABLE delivery_orders ADD CONSTRAINT delivery_orders_no_unique UNIQUE (no)')
}

exports.down = async (knex) => {
  await knex.raw('ALTER TABLE delivery_orders DROP CONSTRAINT IF EXISTS delivery_orders_no_unique')
  await knex.raw('ALTER TABLE delivery_orders DROP COLUMN no')
  // Gabungkan lagi ke satu kolom `no` berisi nomor lengkap
  await knex.raw(`UPDATE delivery_orders SET document_prefix = ${NO_SQL}`)
  await knex.raw('ALTER SEQUENCE delivery_order_no_seq OWNED BY NONE')
  await knex.raw('ALTER TABLE delivery_orders DROP COLUMN document_number')
  await knex.raw('ALTER TABLE delivery_orders RENAME COLUMN document_prefix TO no')
  await knex.raw('ALTER TABLE delivery_orders ADD CONSTRAINT delivery_orders_no_unique UNIQUE (no)')
}
