const config = require('../../config')
const tenant = require('../../database/tenant')
const { wibDate, toWib } = require('../../utils/date')
const p2h = require('../p2h/service')
const meRepo = require('../me/repository')
const doRepo = require('../delivery-orders/repository')
const { getPending } = require('../sync/pending')
const { resolveSettings } = require('./settings')

const getPublicConfig = () => {
  const { mobile, app } = config
  return {
    languages: mobile.languages,
    default_language: app.defaultLanguage,
    min_app_version: mobile.minAppVersion,
    latest_app_version: mobile.latestAppVersion,
    update_url: mobile.updateUrl || null,
    maintenance: {
      active: mobile.maintenance,
      message: mobile.maintenanceMessage,
    },
    support: {
      label: mobile.supportLabel,
      phone: mobile.supportPhone || null,
    },
  }
}

const getConfig = async (db, auth) => {
  const settings = await resolveSettings(db)
  const clientCode = tenant.normalizeCode(auth.client_code)

  return {
    ...settings,
    client_id: `cl_${clientCode.toLowerCase()}`,
    client_code: clientCode,
    client_name: await tenant.getTenantName(clientCode),
  }
}

/**
 * Data awal setelah splash / login. next_screen:
 *   DO_ACTIVE   -> ada DO berjalan
 *   P2H         -> ada unit hari ini tetapi belum di-P2H (atau tidak layak / diminta ulang)
 *   DO_ASSIGNED -> selain itu (daftar DO ditugaskan, bisa kosong)
 */
const getBootstrap = async (db, auth) => {
  const today = wibDate()
  const [profile, settings, active, assignedCount, pending] = await Promise.all([
    meRepo.getProfile(db, auth.sub, auth.device_id),
    resolveSettings(db),
    doRepo.findActive(db, auth.driver_id),
    doRepo.countAssigned(db, auth.driver_id),
    getPending(db, auth.sub),
  ])
  const unit = await meRepo.getUnitForDate(db, auth.driver_id, today)
  const p2hStatus = unit ? await p2h.getStatus(db, unit.id, today) : null

  let nextScreen = 'DO_ASSIGNED'
  if (active) nextScreen = 'DO_ACTIVE'
  else if (p2hStatus && (p2hStatus.status === 'belum' || p2hStatus.status === 'tidak_layak')) nextScreen = 'P2H'

  return {
    server_time: toWib(new Date()),
    config_version: settings.config_version,
    driver: {
      id: profile.driver_id, code: profile.code, name: profile.name, phone: profile.phone,
    },
    unit_today: unit || null,
    p2h_today: p2hStatus && {
      status: p2hStatus.status,
      ...(p2hStatus.p2h_id ? { p2h_id: p2hStatus.p2h_id } : {}),
      ...(p2hStatus.recheck_requested ? { recheck_requested: true } : {}),
    },
    assigned_do_count: assignedCount,
    active_do_id: active ? active.id : null,
    // Item sync yang gagal dan belum berhasil dikirim ulang (tercatat di server)
    pending_sync: {
      count: pending.length,
      ...(pending.length ? { oldest_client_created_at: pending[0].client_created_at } : {}),
    },
    next_screen: nextScreen,
  }
}

module.exports = {
  getPublicConfig, getConfig, getBootstrap, resolveSettings,
}
