const { withAuditNames } = require('../../utils/audit')
const { searchColumns } = require('../../utils/pagination')
const { OPEN_DO_STATUSES } = require('../../utils/master')

const base = (db) => db('locations')
  .leftJoin('customers', 'customers.id', 'locations.customer_id')
  .where({ 'locations.is_delete': false })

const select = (db, query) => query.select(
  'locations.id',
  'locations.type',
  'locations.name',
  'locations.address',
  'locations.city',
  'locations.maps_url',
  'locations.lat',
  'locations.lng',
  'locations.geofence_radius_m',
  'locations.operating_hours',
  'locations.pic_name',
  'locations.pic_phone',
  'locations.customer_id',
  'customers.code as customer_code',
  'customers.name as customer_name',
  'locations.created_at',
  'locations.created_by',
  'locations.updated_at',
  'locations.updated_by'
)

const list = async (db, {
  search, type, customerId, city, hasCoordinates, hasMapsUrl, paging,
}) => {
  const filtered = () => {
    const q = searchColumns(base(db), search, ['locations.name', 'locations.address', 'locations.city'])
    if (type) q.where('locations.type', type)
    if (customerId) q.where('locations.customer_id', customerId)
    if (city) q.whereRaw('lower(locations.city) = ?', [city.toLowerCase()])
    if (hasCoordinates === true) q.whereNotNull('locations.lat').whereNotNull('locations.lng')
    if (hasCoordinates === false) q.where((n) => n.whereNull('locations.lat').orWhereNull('locations.lng'))
    if (hasMapsUrl === true) q.whereRaw("coalesce(locations.maps_url, '') <> ''")
    if (hasMapsUrl === false) q.whereRaw("coalesce(locations.maps_url, '') = ''")
    return q
  }
  const [{ count }] = await filtered().count('locations.id as count')
  const rows = await withAuditNames(select(db, filtered()), 'locations')
    .orderBy(paging.column, paging.direction)
    .orderBy('locations.id')
    .limit(paging.limit)
    .offset(paging.offset)
  return { rows, total: Number(count) }
}

const findById = (db, id) => withAuditNames(select(db, base(db)).where('locations.id', id), 'locations').first()

const findCustomer = (db, id) => db('customers').where({ id, is_delete: false }).first('id')

const insert = async (db, row) => {
  const [created] = await db('locations').insert(row).returning('id')
  return created.id
}

const update = (db, id, fields) => db('locations').where({ id }).update(fields)

/** DO yang belum final dan memakai lokasi ini sebagai asal atau tujuan. */
const findOpenDo = (db, id) => db('delivery_orders')
  .whereIn('status', OPEN_DO_STATUSES)
  .where((q) => q.where({ origin_location_id: id }).orWhere({ destination_location_id: id })
    .orWhereRaw('destinations @> ?::jsonb', [JSON.stringify([{ location_id: id }])])) // juga tujuan di tengah rute
  .first('id', 'no', 'status')

module.exports = {
  list, findById, findCustomer, insert, update, findOpenDo,
}
