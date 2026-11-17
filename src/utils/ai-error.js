/**
 * Error dari lapisan AI (pembaca gambar). Bukan AppError: tidak dikirim ke klien HTTP apa adanya, melainkan dipakai worker
 * antrean untuk memutuskan ulang atau gagal. `retryable` = layak dicoba lagi nanti (jaringan, batas laju, gangguan di sisi OpenAI).
 */
class AiError extends Error {
  /**
   * @param {string} code  ai_not_configured | ai_auth | ai_rate_limited | ai_unavailable | ai_timeout | ai_bad_request |
   *                       ai_bad_response | ai_truncated | ai_refused | ai_bad_image | ai_image_missing
   * @param {object} [options]
   * @param {string} [options.message]
   * @param {boolean} [options.retryable]
   * @param {number} [options.status]       status HTTP dari OpenAI bila ada
   * @param {number} [options.retryAfterMs] jeda yang diminta OpenAI (header Retry-After)
   */
  constructor(code, {
    message, retryable = false, status, retryAfterMs,
  } = {}) {
    super(message || code)
    this.name = 'AiError'
    this.code = code
    this.retryable = retryable
    if (status !== undefined) this.status = status
    if (retryAfterMs !== undefined) this.retryAfterMs = retryAfterMs
  }
}

module.exports = { AiError }
