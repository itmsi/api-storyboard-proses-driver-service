const logger = require('./logger')

/**
 * Transport antrean pengecekan AI di atas RabbitMQ (amqplib).
 *
 * Topologi (dibuat sendiri saat terhubung, idempoten):
 *   <nama>                 antrean utama (durable). Pesan yang di-nack tanpa requeue (JSON rusak, handler error tak terduga)
 *                          dialihkan ke antrean mati.
 *   <nama>.dead            antrean mati (durable): tempat pesan bermasalah untuk diperiksa manual.
 *   <nama>.retry.<ms>      satu antrean tunda per jeda percobaan ulang (durable, x-message-ttl = jeda). Pesan yang kedaluwarsa di sini
 *                          dikembalikan ke antrean utama oleh RabbitMQ sendiri, jadi percobaan ulang tidak butuh timer di proses ini.
 *
 * Catatan: bila antrean dengan nama yang sama sudah ada dengan argumen berbeda, RabbitMQ menolak (PRECONDITION_FAILED); hapus antrean
 * lama atau ganti AI_QUEUE_NAME.
 *
 * Koneksi putus otomatis tersambung kembali dengan jeda bertahap (1 detik sampai 30 detik), lalu topologi dan konsumen dipasang ulang.
 * URL (yang memuat kata sandi) tidak pernah ditulis ke log.
 *
 * Antarmuka (sama dengan penampung di memori yang dipakai test):
 *   start()                        sambungkan (mencoba terus di latar belakang bila broker belum hidup)
 *   publish(message)               terbitkan pekerjaan ke antrean utama (menunggu konfirmasi broker)
 *   publishRetry(message, delayMs) terbitkan ke antrean tunda dengan jeda terdekat yang tersedia
 *   consume(handler)               handler(message) selesai = ack; error = dialihkan ke antrean mati
 *   stop()
 */
const createRabbitTransport = ({
  url, queueName, retryDelaysMs = [], prefetch = 2, amqp = require('amqplib'), minBackoffMs = 1000, maxBackoffMs = 30000,
}) => {
  const retryQueue = (ms) => `${queueName}.retry.${ms}`
  const deadQueue = `${queueName}.dead`
  const tiers = [...new Set(retryDelaysMs)].sort((a, b) => a - b)

  let connection = null
  let publishChannel = null
  let consumeChannel = null
  let handler = null
  let stopping = false
  let backoff = minBackoffMs
  let timer = null
  let connecting = null

  const assertTopology = async (channel) => {
    await channel.assertQueue(deadQueue, { durable: true })
    await channel.assertQueue(queueName, { durable: true, arguments: { 'x-dead-letter-exchange': '', 'x-dead-letter-routing-key': deadQueue } })
    // eslint-disable-next-line no-restricted-syntax
    for (const ms of tiers) {
      // eslint-disable-next-line no-await-in-loop
      await channel.assertQueue(retryQueue(ms), {
        durable: true,
        arguments: { 'x-message-ttl': ms, 'x-dead-letter-exchange': '', 'x-dead-letter-routing-key': queueName },
      })
    }
  }

  const attachConsumer = async () => {
    if (!handler || !consumeChannel) return
    await consumeChannel.prefetch(prefetch)
    await consumeChannel.consume(queueName, async (msg) => {
      if (!msg) return // konsumen dibatalkan broker; akan dipasang ulang saat koneksi tersambung kembali
      const channel = consumeChannel
      let message
      try {
        message = JSON.parse(msg.content.toString('utf8'))
      } catch (err) {
        logger.error('Pesan antrean AI bukan JSON; dialihkan ke antrean mati')
        channel.nack(msg, false, false)
        return
      }
      try {
        await handler(message)
        channel.ack(msg)
      } catch (err) {
        logger.error(`Pekerjaan AI gagal tak terduga (${message && message.ai_check_id}): ${err.message}; dialihkan ke antrean mati`)
        try {
          channel.nack(msg, false, false)
        } catch (nackErr) {
          logger.warn('Saluran sudah tertutup; pesan akan dikirim ulang broker')
        }
      }
    })
  }

  const scheduleReconnect = () => {
    if (stopping || timer) return
    logger.warn(`Koneksi RabbitMQ terputus; mencoba lagi dalam ${Math.round(backoff / 1000)} detik`)
    timer = setTimeout(() => {
      timer = null
      // eslint-disable-next-line no-use-before-define
      connect().catch(() => {})
    }, backoff)
    timer.unref()
    backoff = Math.min(backoff * 2, maxBackoffMs)
  }

  const connect = async () => {
    if (connecting) return connecting
    connecting = (async () => {
      let conn
      try {
        conn = await amqp.connect(url)
        conn.on('error', (err) => logger.error(`RabbitMQ: ${err.message}`))
        conn.on('close', () => {
          if (connection === conn) {
            connection = null
            publishChannel = null
            consumeChannel = null
            scheduleReconnect()
          }
        })
        const pub = await conn.createConfirmChannel()
        pub.on('error', (err) => logger.error(`RabbitMQ (penerbit): ${err.message}`))
        await assertTopology(pub)
        const sub = await conn.createChannel()
        sub.on('error', (err) => logger.error(`RabbitMQ (konsumen): ${err.message}`))
        connection = conn
        publishChannel = pub
        consumeChannel = sub
        backoff = minBackoffMs
        await attachConsumer()
        logger.info(`RabbitMQ terhubung; antrean ${queueName}`)
      } catch (err) {
        logger.error(`RabbitMQ gagal terhubung: ${err.message}`)
        if (conn) await conn.close().catch(() => {})
        connection = null
        publishChannel = null
        consumeChannel = null
        scheduleReconnect()
        throw err
      } finally {
        connecting = null
      }
    })()
    return connecting
  }

  const send = (queue, message) => {
    if (!publishChannel) return Promise.reject(new Error('RabbitMQ belum terhubung'))
    return new Promise((resolve, reject) => {
      publishChannel.sendToQueue(
        queue,
        Buffer.from(JSON.stringify(message)),
        { persistent: true, contentType: 'application/json' },
        (err) => (err ? reject(err) : resolve())
      )
    })
  }

  return {
    start: () => connect().catch(() => {}), // gagal awal tidak menjatuhkan server; sambungan dicoba terus
    publish: (message) => send(queueName, message),
    publishRetry: (message, delayMs) => {
      if (!tiers.length) return send(queueName, message) // tanpa antrean tunda: langsung ke antrean utama
      const tier = tiers.find((ms) => ms >= delayMs) || tiers[tiers.length - 1]
      return send(retryQueue(tier), message)
    },
    consume: async (fn) => {
      handler = fn
      await attachConsumer()
    },
    isConnected: () => Boolean(connection),
    stop: async () => {
      stopping = true
      if (timer) clearTimeout(timer)
      timer = null
      const conn = connection
      connection = null
      publishChannel = null
      consumeChannel = null
      if (conn) await conn.close().catch(() => {})
    },
  }
}

module.exports = { createRabbitTransport }
