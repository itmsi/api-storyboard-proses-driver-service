const getSettings = (db) => db('app_settings').select('key', 'value')

const getExpenseCategories = (db) => db('expense_categories')
  .where({ is_active: true })
  .orderBy('sort_order')
  .select('code', 'label', 'input', 'description_required', 'proof_required')

/** Simpan satu pengaturan (nilai JSON). Nilai teks harus di-JSON-kan dulu agar valid sebagai jsonb. */
const upsertSetting = (db, key, value, adminId) => db('app_settings')
  .insert({
    key, value: JSON.stringify(value), created_by: adminId, updated_by: adminId,
  })
  .onConflict('key')
  .merge({ value: JSON.stringify(value), updated_by: adminId })

const findSetting = (db, key) => db('app_settings').where({ key }).forUpdate().first('value')

module.exports = {
  getSettings, getExpenseCategories, upsertSetting, findSetting,
}
