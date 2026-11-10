const http = require('http')

process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret'
process.env.BCRYPT_ROUNDS = '4'

const config = require('../src/config')
const app = require('../src/app')

config.internal.apiKey = 'test-internal-key' // dibaca per request, jadi aman diatur setelah config dimuat

/** Jalankan app di port acak, kembalikan request() + close(). Bukan dev server: hidup hanya selama test. */
const startApp = async () => {
  const server = http.createServer(app)
  await new Promise((resolve) => { server.listen(0, '127.0.0.1', resolve) })
  const { port } = server.address()

  const request = async (method, path, { body, token, headers } = {}) => {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    return { status: res.status, body: await res.json() }
  }

  /** multipart/form-data: fields = objek string, file = { buffer, name, type } */
  const upload = async (path, { token, fields, file }) => {
    const form = new FormData()
    Object.entries(fields).forEach(([k, v]) => form.append(k, typeof v === 'string' ? v : JSON.stringify(v)))
    if (file) form.append('file', new Blob([file.buffer], { type: file.type }), file.name)
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: token ? { authorization: `Bearer ${token}` } : {},
      body: form,
    })
    return { status: res.status, body: await res.json() }
  }

  return { request, upload, close: () => new Promise((resolve) => { server.close(resolve) }) }
}

module.exports = { startApp }
