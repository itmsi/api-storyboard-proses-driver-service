/**
 * Label singkat perangkat dari header User-Agent, mis. "Chrome, Windows". Tanpa pustaka: cukup untuk menampilkan sesi di Pengaturan.
 * Urutan pemeriksaan penting (Edge dan Opera juga memuat "Chrome", Chrome memuat "Safari").
 */
const BROWSERS = [
  [/Edg(e|A|iOS)?\//, 'Edge'],
  [/OPR\/|Opera/, 'Opera'],
  [/Firefox\/|FxiOS\//, 'Firefox'],
  [/Chrome\/|CriOS\//, 'Chrome'],
  [/Safari\//, 'Safari'],
]
const SYSTEMS = [
  [/Windows/, 'Windows'],
  [/Android/, 'Android'],
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Mac OS X|Macintosh/, 'macOS'],
  [/CrOS/, 'ChromeOS'],
  [/Linux/, 'Linux'],
]

const pick = (list, ua) => {
  const hit = list.find(([re]) => re.test(ua))
  return hit ? hit[1] : null
}

/** @returns {string|null} null bila User-Agent kosong atau tidak dikenali sama sekali */
const label = (userAgent) => {
  if (!userAgent) return null
  const parts = [pick(BROWSERS, userAgent), pick(SYSTEMS, userAgent)].filter(Boolean)
  return parts.length ? parts.join(', ') : null
}

module.exports = { label }
