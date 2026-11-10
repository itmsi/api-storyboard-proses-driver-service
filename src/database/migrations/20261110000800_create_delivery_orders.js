const { addAudit, addUpdatedAtTrigger } = require('../helpers/audit')

// Delivery order (skema: schema.draft.sql bagian 6). Alamat asal/tujuan di-snapshot ke DO supaya riwayat tidak berubah.
exports.up = async (knex) => {
  await knex.raw('CREATE SEQUENCE delivery_order_no_seq')

  await knex.schema.createTable('delivery_orders', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'))
    t.text('no').notNullable().unique() // DO-0144
    t.uuid('customer_id').references('id').inTable('customers')
    t.uuid('driver_id').notNullable().references('id').inTable('drivers')
    t.uuid('unit_id').notNullable().references('id').inTable('units')

    t.text('status').notNullable().defaultTo('assigned')
    t.text('delivery_status') // diisi saat serah terima

    t.uuid('origin_location_id').references('id').inTable('locations')
    t.jsonb('origin_snapshot').notNullable() // {name, address, city, lat, lng}
    t.uuid('destination_location_id').references('id').inTable('locations')
    t.jsonb('destination_snapshot').notNullable() // {name, city, address, lat, lng, operating_hours, pic: {name, phone}}
    t.timestamp('planned_load_at', { useTz: true })

    t.text('cargo_description').notNullable() // 4 palet
    t.decimal('cargo_quantity', 12, 2).notNullable()
    t.text('cargo_unit').notNullable() // palet
    t.decimal('estimated_distance_km', 8, 1)

    t.bigInteger('travel_allowance_amount').notNullable().defaultTo(0)
    t.timestamp('travel_allowance_received_at', { useTz: true })

    // Ringkasan yang diperbarui modul perjalanan (odometer, biaya) dalam transaksi yang sama,
    // supaya daftar Berjalan dan Riwayat tidak perlu menjumlah tabel lain.
    t.integer('odometer_start_km')
    t.integer('odometer_end_km')
    t.bigInteger('expense_total').notNullable().defaultTo(0)

    t.uuid('assigned_by').notNullable().references('id').inTable('users')
    t.timestamp('assigned_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    t.timestamp('accepted_at', { useTz: true })
    t.timestamp('started_at', { useTz: true }) // saat odometer awal
    t.timestamp('completed_at', { useTz: true })
    t.timestamp('locked_at', { useTz: true }) // setelah selesai: tidak bisa diubah dari aplikasi
    t.timestamp('cancelled_at', { useTz: true })
    t.text('cancel_reason')
    addAudit(knex, t)
  })
  await knex.raw(`ALTER TABLE delivery_orders ADD CONSTRAINT do_status_chk CHECK (status IN (
    'assigned', 'accepted', 'loading', 'in_transit', 'handover', 'completed', 'cancelled'))`)
  await knex.raw(`ALTER TABLE delivery_orders ADD CONSTRAINT do_delivery_status_chk CHECK (
    delivery_status IS NULL OR delivery_status IN ('terkirim_lengkap', 'terkirim_catatan', 'gagal_kirim'))`)
  await knex.raw('ALTER TABLE delivery_orders ADD CONSTRAINT do_allowance_chk CHECK (travel_allowance_amount >= 0)')
  await knex.raw('CREATE INDEX do_driver_status_idx ON delivery_orders (driver_id, status)')
  await knex.raw('CREATE INDEX do_driver_completed_idx ON delivery_orders (driver_id, completed_at DESC, id DESC)') // riwayat (cursor)
  await knex.raw('CREATE INDEX do_unit_idx ON delivery_orders (unit_id)')
  // satu driver hanya boleh punya satu DO aktif
  await knex.raw(`CREATE UNIQUE INDEX do_one_active_per_driver_uq ON delivery_orders (driver_id)
    WHERE status IN ('accepted', 'loading', 'in_transit', 'handover')`)
  await addUpdatedAtTrigger(knex, 'delivery_orders')

  // Jejak setiap langkah/perubahan status (audit + timeline admin). client_ref = idempotensi dari HP.
  await knex.schema.createTable('delivery_order_events', (t) => {
    t.bigIncrements('id')
    t.uuid('delivery_order_id').notNullable().references('id').inTable('delivery_orders')
    t.text('event').notNullable() // assigned, accepted, loaded, odometer_start, expense_added, handover, completed...
    t.text('from_status')
    t.text('to_status')
    t.uuid('actor_id').references('id').inTable('users')
    t.timestamp('occurred_at', { useTz: true }).notNullable() // waktu di HP
    t.decimal('lat', 9, 6)
    t.decimal('lng', 9, 6)
    t.jsonb('payload')
    t.uuid('client_ref')
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now())
    t.index(['delivery_order_id', 'occurred_at'], 'doe_do_idx')
  })
  await knex.raw('CREATE UNIQUE INDEX doe_client_ref_uq ON delivery_order_events (actor_id, client_ref) WHERE client_ref IS NOT NULL')
}

exports.down = async (knex) => {
  await knex.schema.dropTableIfExists('delivery_order_events')
  await knex.schema.dropTableIfExists('delivery_orders')
  await knex.raw('DROP SEQUENCE IF EXISTS delivery_order_no_seq')
}
