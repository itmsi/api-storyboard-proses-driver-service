const config = require('../../config')

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

module.exports = { getPublicConfig }
