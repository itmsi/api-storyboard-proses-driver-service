/** Simpan FCM token di perangkat milik user; mengembalikan jumlah baris yang diubah. */
const saveFcmToken = (db, userId, deviceId, fcmToken) => db('devices')
  .where({ user_id: userId, device_id: deviceId })
  .update({ fcm_token: fcmToken, last_seen_at: db.fn.now(), updated_by: userId })

module.exports = { saveFcmToken }
