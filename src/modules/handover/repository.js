const findByClientRef = (db, userId, clientRef) => db('handovers').where({ created_by: userId, client_ref: clientRef }).first()

const insertHandover = async (trx, row) => {
  const [created] = await trx('handovers').insert(row).returning('*')
  return created
}

/** Masalah serah terima beserta foto kerusakannya. */
const insertIssues = async (trx, handoverId, issues) => {
  for (const issue of issues) { // eslint-disable-line no-restricted-syntax
    // eslint-disable-next-line no-await-in-loop
    const [created] = await trx('handover_issues').insert({
      handover_id: handoverId,
      type: issue.type,
      quantity: issue.quantity,
      unit: issue.unit,
      note: issue.note || null,
    }).returning('id')
    if (issue.photo_ids.length) {
      // eslint-disable-next-line no-await-in-loop
      await trx('handover_issue_photos').insert(issue.photo_ids.map((mediaId) => ({ issue_id: created.id, media_id: mediaId })))
    }
  }
}

const insertDoMedia = (trx, rows) => trx('delivery_order_media').insert(rows)

module.exports = {
  findByClientRef, insertHandover, insertIssues, insertDoMedia,
}
