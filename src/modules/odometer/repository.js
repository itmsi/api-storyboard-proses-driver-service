const findByClientRef = (db, userId, clientRef) => db('odometer_readings').where({ created_by: userId, client_ref: clientRef }).first()

const insert = async (trx, row) => {
  const [created] = await trx('odometer_readings').insert(row).returning('*')
  return created
}

/** Odometer terakhir yang tercatat untuk unit (sebelum bacaan baru), untuk mendeteksi angka yang mundur. */
const unitOdometer = async (db, unitId) => {
  const unit = await db('units').where({ id: unitId }).first('last_odometer_km')
  return unit ? unit.last_odometer_km : null
}

const findMedia = (db, id) => db('media').where({ id }).first()

/** Odometer unit hanya naik: simpan angka akhir terbesar yang pernah dicatat. */
const raiseUnitOdometer = (trx, unitId, km) => trx('units')
  .where({ id: unitId })
  .where((q) => q.whereNull('last_odometer_km').orWhere('last_odometer_km', '<', km))
  .update({ last_odometer_km: km })

module.exports = {
  findByClientRef, insert, findMedia, raiseUnitOdometer, unitOdometer,
}
