const config = require('../config')
const { AiError } = require('./ai-error')

/**
 * Klien pembaca gambar untuk OpenAI (endpoint /chat/completions dengan gambar dan jawaban JSON berskema ketat).
 * Tanpa dependency tambahan: memakai fetch bawaan Node. API key dikirim per panggilan (satu key per client) dan TIDAK
 * pernah ditulis ke log atau pesan error.
 */

const retryAfterMs = (res) => {
  const value = Number(res.headers.get('retry-after'))
  return Number.isFinite(value) && value > 0 ? Math.min(value * 1000, 5 * 60 * 1000) : undefined
}

/** Pesan error dari badan respons OpenAI (hanya teks error-nya, tanpa isi yang kita kirim). */
const upstreamMessage = async (res) => {
  try {
    const json = await res.json()
    return json && json.error && json.error.message ? String(json.error.message).slice(0, 300) : null
  } catch (err) {
    return null
  }
}

const failFromStatus = async (res) => {
  const detail = await upstreamMessage(res)
  const base = { status: res.status }
  if (res.status === 401 || res.status === 403) {
    return new AiError('ai_auth', { ...base, message: 'API key OpenAI ditolak. Periksa API key client.' })
  }
  if (res.status === 429) {
    return new AiError('ai_rate_limited', {
      ...base, retryable: true, retryAfterMs: retryAfterMs(res), message: detail || 'Batas pemakaian OpenAI tercapai.',
    })
  }
  if (res.status >= 500 || res.status === 408) {
    return new AiError('ai_unavailable', { ...base, retryable: true, message: detail || `OpenAI sedang bermasalah (HTTP ${res.status}).` })
  }
  return new AiError('ai_bad_request', { ...base, message: detail || `Permintaan ditolak OpenAI (HTTP ${res.status}).` })
}

/**
 * Baca satu gambar dan kembalikan JSON sesuai skema.
 *
 * @param {object} args
 * @param {string} args.apiKey                  API key OpenAI milik client
 * @param {{ buffer: Buffer, mime: string }} args.image  gambar yang sudah disiapkan (lihat ai-image.prepareImage)
 * @param {string} args.instruction             perintah sistem (apa yang dibaca dan aturannya)
 * @param {string} args.schemaName              nama skema (huruf, angka, _ dan -)
 * @param {object} args.schema                  JSON Schema ketat (semua properti wajib, additionalProperties false)
 * @param {string} [args.model]
 * @param {number} [args.timeoutMs]
 * @param {string} [args.baseUrl]
 * @returns {Promise<{ data: object, model: string, usage: object|null }>}
 * @throws {AiError}
 */
const readImage = async ({
  apiKey, image, instruction, schemaName, schema,
  model = config.ai.openai.visionModel,
  timeoutMs = config.ai.openai.timeoutMs,
  baseUrl = config.ai.openai.baseUrl,
  maxCompletionTokens = config.ai.openai.maxCompletionTokens,
  reasoningEffort = config.ai.openai.reasoningEffort,
}) => {
  if (!apiKey) throw new AiError('ai_not_configured', { message: 'API key OpenAI untuk client ini belum diisi.' })

  const body = {
    model,
    messages: [
      { role: 'system', content: instruction },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Baca gambar ini sesuai aturan, dan balas hanya dengan JSON sesuai skema.' },
          { type: 'image_url', image_url: { url: `data:${image.mime};base64,${image.buffer.toString('base64')}`, detail: 'high' } },
        ],
      },
    ],
    response_format: { type: 'json_schema', json_schema: { name: schemaName, strict: true, schema } },
    max_completion_tokens: maxCompletionTokens,
    ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
  }

  let res
  try {
    res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (err) {
    if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new AiError('ai_timeout', { retryable: true, message: `OpenAI tidak menjawab dalam ${Math.round(timeoutMs / 1000)} detik.` })
    }
    throw new AiError('ai_unavailable', { retryable: true, message: 'Tidak bisa menghubungi OpenAI.' })
  }

  if (!res.ok) throw await failFromStatus(res)

  let payload
  try {
    payload = await res.json()
  } catch (err) {
    throw new AiError('ai_bad_response', { retryable: true, message: 'Balasan OpenAI bukan JSON.' })
  }

  const choice = payload && payload.choices && payload.choices[0]
  const message = choice && choice.message
  if (!message) throw new AiError('ai_bad_response', { retryable: true, message: 'Balasan OpenAI tidak berisi jawaban.' })
  if (message.refusal) throw new AiError('ai_refused', { message: 'Model menolak membaca gambar ini.' })
  // Batas token habis sebelum jawaban selesai (model penalaran yang terlalu lama "berpikir"): bukan JSON rusak. Dicoba ulang; bila terus terjadi,
  // naikkan OPENAI_MAX_COMPLETION_TOKENS atau turunkan OPENAI_REASONING_EFFORT.
  if (choice.finish_reason === 'length') {
    throw new AiError('ai_truncated', { retryable: true, message: 'Jawaban model terpotong (batas token habis). Naikkan OPENAI_MAX_COMPLETION_TOKENS atau turunkan OPENAI_REASONING_EFFORT.' })
  }

  let data
  try {
    data = JSON.parse(message.content)
  } catch (err) {
    throw new AiError('ai_bad_response', { retryable: true, message: 'Jawaban model bukan JSON yang valid.' })
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new AiError('ai_bad_response', { retryable: true, message: 'Jawaban model bukan objek JSON.' })
  }

  return { data, model: payload.model || model, usage: payload.usage || null }
}

/**
 * Cek API key tanpa memakai kuota: GET /models. Lolos = key diterima OpenAI.
 * @throws {AiError} ai_auth (ditolak), ai_rate_limited / ai_unavailable / ai_timeout (belum bisa dipastikan)
 */
const checkApiKey = async ({
  apiKey, baseUrl = config.ai.openai.baseUrl, timeoutMs = Math.min(config.ai.openai.timeoutMs, 10000),
}) => {
  if (!apiKey) throw new AiError('ai_not_configured', { message: 'API key OpenAI untuk client ini belum diisi.' })
  let res
  try {
    res = await fetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(timeoutMs) })
  } catch (err) {
    if (err && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new AiError('ai_timeout', { retryable: true, message: 'OpenAI tidak menjawab.' })
    }
    throw new AiError('ai_unavailable', { retryable: true, message: 'Tidak bisa menghubungi OpenAI.' })
  }
  if (!res.ok) throw await failFromStatus(res)
  return true
}

module.exports = { readImage, checkApiKey }
