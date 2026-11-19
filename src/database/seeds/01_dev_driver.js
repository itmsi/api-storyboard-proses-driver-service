const bcrypt = require('bcrypt')
const { wibDate } = require('../../utils/date')
const { ensureDefaultRoles } = require('../tenant/default-roles')

// Data dev: admin + driver Andi (DRV-0021) sesuai fixture. Password dev = "Passw0rd!" (JANGAN dipakai di production).
const DEV_PASSWORD = 'Passw0rd!'

exports.seed = async (knex) => {
  if (process.env.NODE_ENV === 'production') throw new Error('Seed dev tidak boleh dijalankan di production')

  const hash = await bcrypt.hash(DEV_PASSWORD, 10)
  // Id dibuat database (gen_random_uuid), seed dicari lewat username supaya aman dijalankan ulang
  const { administratorId, driverId } = await ensureDefaultRoles(knex)
  await knex('users').insert({
    username: 'admin', phone: null, email: 'admin@contoh.co.id', password_hash: hash, role_id: administratorId, name: 'Admin OGO',
  }).onConflict().ignore()
  const adminId = (await knex('users').where({ username: 'admin' }).first('id')).id

  await knex('users').insert({
    username: 'DRV-0021',
    phone: '+6281234567890',
    password_hash: hash,
    role_id: driverId,
    name: 'Andi',
    created_by: adminId,
  }).onConflict().ignore()
  const userId = (await knex('users').where({ username: 'DRV-0021' }).first('id')).id

  await knex('drivers').insert({
    user_id: userId,
    code: 'DRV-0021',
    license_no: '1234-5678-9012',
    license_type: 'B2 Umum',
    created_by: adminId,
  }).onConflict('code').ignore()

  // Unit B 9123 KZ, driver bawaan Andi
  await knex('units').insert({
    plate: 'B 9123 KZ', unit_type: 'CDD Bak', max_load_kg: 2500, brand: 'Mitsubishi', year: 2022, created_by: adminId,
  }).onConflict().ignore()
  const unit = await knex('units').whereRaw("upper(replace(plate, ' ', '')) = 'B9123KZ'").first()
  const driver = await knex('drivers').where({ code: 'DRV-0021' }).first()
  // Andi adalah driver bawaan unit ini: otomatis memegang unitnya setiap hari
  await knex('units').where({ id: unit.id }).update({ driver_id: driver.id, driver_assigned_at: new Date() })

  // Customer + lokasi + DO-0144 (Cakung -> PT Contoh Jaya, Karawang) sesuai fixture
  await knex('customers').insert({
    code: 'CUST-001', name: 'PT Contoh Jaya', phone: '021-5550100', created_by: adminId,
  }).onConflict(knex.raw('(code) WHERE is_delete = false')).ignore()
  const customer = await knex('customers').where({ code: 'CUST-001' }).first()
  const sites = [
    {
      type: 'warehouse', name: 'Gudang Cakung', address: 'Jl. Raya Cakung Cilincing, Jakarta Timur', city: 'Cakung', lat: -6.18, lng: 106.94,
    },
    {
      type: 'customer_site',
      customer_id: customer.id,
      name: 'PT Contoh Jaya',
      address: 'Kawasan Industri KIIC, Karawang',
      city: 'Karawang',
      lat: -6.3,
      lng: 107.29,
      operating_hours: '08:00-17:00',
      pic_name: 'Pak Rudi',
      pic_phone: '+628111222333',
    },
  ]
  const locations = {}
  for (const site of sites) { // eslint-disable-line no-restricted-syntax
    // eslint-disable-next-line no-await-in-loop
    let row = await knex('locations').where({ name: site.name }).first()
    // eslint-disable-next-line no-await-in-loop
    if (!row) [row] = await knex('locations').insert({ ...site, created_by: adminId }).returning('*')
    locations[site.type] = row
  }
  const origin = locations.warehouse
  const destination = locations.customer_site
  await knex('delivery_orders').insert({
    document_prefix: 'DO-',
    document_number: 144, // `no` (DO-0144) dibentuk database dari prefix + nomor
    customer_id: customer.id,
    driver_id: driver.id,
    unit_id: unit.id,
    origin_location_id: origin.id,
    origin_snapshot: {
      name: origin.name, address: origin.address, city: origin.city, lat: Number(origin.lat), lng: Number(origin.lng),
    },
    destination_location_id: destination.id,
    destination_snapshot: {
      name: destination.name,
      city: destination.city,
      address: destination.address,
      lat: Number(destination.lat),
      lng: Number(destination.lng),
      operating_hours: destination.operating_hours,
      pic: { name: destination.pic_name, phone: destination.pic_phone },
    },
    destinations: JSON.stringify([{
      step: 1,
      location_id: destination.id,
      snapshot: {
        name: destination.name,
        city: destination.city,
        address: destination.address,
        lat: Number(destination.lat),
        lng: Number(destination.lng),
        operating_hours: destination.operating_hours,
        pic: { name: destination.pic_name, phone: destination.pic_phone },
      },
    }]),
    planned_load_at: new Date(`${wibDate()}T13:00:00+07:00`),
    cargo_type: 'Palet',
    cargo_details: JSON.stringify([
      { label: 'Barang', value: 'Minuman kemasan' },
      { label: 'Jumlah', value: '4 palet' },
    ]),
    estimated_distance_km: 70,
    travel_allowance_amount: 600000,
    assigned_by: adminId,
    created_by: adminId,
  }).onConflict('no').ignore()
  // Nomor diisi manual di atas: majukan sequence supaya DO baru tidak memakai nomor yang sama
  await knex.raw(`SELECT setval('delivery_order_no_seq',
    greatest((SELECT coalesce(max(document_number), 0) FROM delivery_orders), (SELECT last_value FROM delivery_order_no_seq), 1))`)
}
