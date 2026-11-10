const getOdometers = (db, doId) => db('odometer_readings')
  .where({ delivery_order_id: doId })
  .select('type', 'effective_km', 'effective_source', 'captured_at')

const insertSettlement = (trx, row) => trx('settlements').insert(row)

module.exports = { getOdometers, insertSettlement }
