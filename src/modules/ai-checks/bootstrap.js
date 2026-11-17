const config = require('../../config')
const logger = require('../../utils/logger')
const queue = require('../../utils/ai-queue')
const { createRabbitTransport } = require('../../utils/rabbitmq-transport')
const worker = require('./worker')

/**
 * Pasang antrean pengecekan AI saat server hidup:
 *  - pengirim pesan (supaya POST /media/{id}/ai-check bisa menerbitkan pekerjaan),
 *  - konsumen (bila AI_WORKER_ENABLED), dan
 *  - sapuan berkala untuk pekerjaan yang tersangkut.
 * Tanpa AI_ENABLED atau RABBITMQ_URL tidak ada yang dipasang: permintaan tetap diterima (baris queued) tetapi tidak diproses.
 *
 * @returns {Promise<{ stop: Function }>}
 */
const start = async () => {
  const {
    enabled, url, name, worker: consume, concurrency, retryDelaysMs, sweepIntervalMs,
  } = config.ai.queue
  if (!config.ai.enabled) {
    logger.info('Pengecekan AI dinonaktifkan (AI_ENABLED=false); antrean tidak dipasang')
    return { stop: async () => {} }
  }
  if (!enabled) {
    logger.info('RABBITMQ_ENABLED=false: antrean pengecekan AI tidak dipasang, permintaan hanya menunggu di database')
    return { stop: async () => {} }
  }
  if (!url) {
    logger.warn('RABBITMQ_URL kosong: antrean pengecekan AI tidak dipasang, permintaan hanya menunggu di database')
    return { stop: async () => {} }
  }

  const transport = createRabbitTransport({
    url, queueName: name, retryDelaysMs, prefetch: concurrency,
  })
  queue.setPublisher(transport.publish)
  await transport.start()

  let timer = null
  if (consume) {
    await transport.consume(worker.createHandler(transport))
    timer = setInterval(() => { worker.sweepPending().catch((err) => logger.warn(`Sapuan pengecekan AI gagal: ${err.message}`)) }, sweepIntervalMs)
    timer.unref()
    logger.info(`Worker pengecekan AI aktif (bersamaan: ${concurrency}, percobaan maksimal: ${config.ai.queue.maxAttempts})`)
  } else {
    logger.info('AI_WORKER_ENABLED=false: proses ini hanya menerbitkan pesan pengecekan AI')
  }

  return {
    stop: async () => {
      if (timer) clearInterval(timer)
      queue.setPublisher(null)
      await transport.stop()
    },
  }
}

module.exports = { start }
