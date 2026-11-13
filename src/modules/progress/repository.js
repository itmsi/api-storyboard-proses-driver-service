/** Pembacaan data langkah perjalanan (muat, odometer, serah terima) untuk ditampilkan ulang di aplikasi driver. */
const doRepo = require('../delivery-orders/manage-repository')

const loading = (db, doId) => doRepo.loading(db, doId)

const odometers = (db, doId) => doRepo.odometers(db, doId)

const handover = (db, doId) => doRepo.handover(db, doId)

/** Foto yang menempel ke DO (muat, surat jalan, bongkar, lokasi, tanda tangan) beserta tujuan dan nomor halamannya. */
const doMedia = (db, doId) => doRepo.media(db, doId)

const mediaByIds = (db, ids) => (ids.length ? db('media').whereIn('id', ids).where({ is_delete: false }) : Promise.resolve([]))

/** Foto kerusakan per masalah serah terima: [{ issue_id, ...media }]. */
const issuePhotos = (db, issueIds) => (issueIds.length
  ? db('handover_issue_photos')
    .join('media', 'media.id', 'handover_issue_photos.media_id')
    .whereIn('handover_issue_photos.issue_id', issueIds)
    .select('media.*', 'handover_issue_photos.issue_id')
  : Promise.resolve([]))

module.exports = {
  loading, odometers, handover, doMedia, mediaByIds, issuePhotos,
}
