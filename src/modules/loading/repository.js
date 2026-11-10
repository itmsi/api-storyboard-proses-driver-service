const findByClientRef = (db, userId, clientRef) => db('loadings').where({ created_by: userId, client_ref: clientRef }).first()

const insert = async (trx, row, mediaLinks) => {
  const [loading] = await trx('loadings').insert(row).returning('*')
  await trx('delivery_order_media').insert(mediaLinks)
  return loading
}

module.exports = { findByClientRef, insert }
