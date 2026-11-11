/**
 * Satu route, validasi/handler berbeda menurut peran akun (req.auth.role).
 *
 *   router.get('/', anyRole, byRole({ driver: [validate(a)], admin: [validate(b)] }), asyncHandler(controller.list))
 *
 * Peran tanpa entri dilewati tanpa middleware tambahan. Middleware di tiap peran dijalankan berurutan.
 */
const byRole = (chains) => (req, res, next) => {
  const chain = chains[req.auth && req.auth.role] || []
  let index = 0
  const step = (err) => {
    if (err || index >= chain.length) return next(err)
    const mw = chain[index]
    index += 1
    return mw(req, res, step)
  }
  return step()
}

module.exports = { byRole }
