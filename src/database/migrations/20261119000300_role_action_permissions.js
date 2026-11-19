// Aksi tambahan di luar CRUD (utils/permissions.js EXTRA_ACTIONS). Role admin buatan sendiri yang sudah boleh mengubah modulnya diberi aksi
// barunya supaya perilakunya tidak berubah; Administrator bawaan tidak menyimpan hak (dihitung otomatis).
const GRANTS = [
  ['settlements', 'approve'],
  ['p2h', 'recheck'],
  ['drivers', 'reset_password'],
  ['users', 'reset_password'],
]

exports.up = async (knex) => {
  const roles = await knex('roles').where({ user_type: 'admin', is_system: false }).select('id', 'permissions')
  // eslint-disable-next-line no-restricted-syntax
  for (const role of roles) {
    const permissions = role.permissions || {}
    let changed = false
    GRANTS.forEach(([resource, action]) => {
      const actions = permissions[resource]
      if (Array.isArray(actions) && actions.includes('update') && !actions.includes(action)) {
        permissions[resource] = [...actions, action]
        changed = true
      }
    })
    // eslint-disable-next-line no-await-in-loop
    if (changed) await knex('roles').where({ id: role.id }).update({ permissions: JSON.stringify(permissions) })
  }
}

exports.down = async (knex) => {
  const roles = await knex('roles').where({ user_type: 'admin', is_system: false }).select('id', 'permissions')
  // eslint-disable-next-line no-restricted-syntax
  for (const role of roles) {
    const permissions = role.permissions || {}
    let changed = false
    GRANTS.forEach(([resource, action]) => {
      if (Array.isArray(permissions[resource]) && permissions[resource].includes(action)) {
        permissions[resource] = permissions[resource].filter((a) => a !== action)
        if (!permissions[resource].length) delete permissions[resource]
        changed = true
      }
    })
    // eslint-disable-next-line no-await-in-loop
    if (changed) await knex('roles').where({ id: role.id }).update({ permissions: JSON.stringify(permissions) })
  }
}
