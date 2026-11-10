const { AppError } = require('../../utils/errors')
const repo = require('./repository')

// Topik push yang dikirim backend ke driver (lihat payload PushDoAssigned / PushP2hRecheckRequested)
const TOPICS = ['do_assigned', 'p2h_recheck_requested']

const registerPushToken = async (db, auth, { device_id: deviceId, fcm_token: fcmToken }) => {
  const updated = await repo.saveFcmToken(db, auth.sub, deviceId, fcmToken)
  // Perangkat dibuat saat login; device_id yang tidak dikenal = bukan perangkat sesi ini
  if (!updated) {
    throw new AppError('VALIDATION_ERROR', { details: [{ field: 'device_id', message: 'Perangkat belum terdaftar, silakan login ulang.' }] })
  }
  return { registered: true, topics: TOPICS }
}

module.exports = { registerPushToken }
