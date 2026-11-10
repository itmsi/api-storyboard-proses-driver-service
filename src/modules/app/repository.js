const getSettings = (db) => db('app_settings').select('key', 'value')

const getExpenseCategories = (db) => db('expense_categories')
  .where({ is_active: true })
  .orderBy('sort_order')
  .select('code', 'label', 'input', 'description_required', 'proof_required')

module.exports = { getSettings, getExpenseCategories }
