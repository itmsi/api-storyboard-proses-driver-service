const {
  ref, envelope, jsonResponse, jsonBody, errorRef, authErrors, secured,
} = require('../helpers')

module.exports = {
  // ===================== App =====================
  '/config/public': {
    get: {
      tags: ['App'],
      summary: 'Konfigurasi publik (sebelum login)',
      description: 'Dipanggil di Splash saat belum ada token: versi minimum aplikasi, mode maintenance, kontak admin.',
      responses: {
        200: jsonResponse('OK', envelope(ref('PublicConfig')), '01-app/GET.config.public.response.json'),
      },
    },
  },
  '/config': {
    get: {
      tags: ['App'],
      summary: 'Konfigurasi klien (modul aktif, aturan foto, kategori biaya)',
      description: 'Ambil ulang jika `config_version` dari bootstrap berbeda dengan yang tersimpan di HP.',
      security: secured,
      responses: {
        200: jsonResponse('OK', envelope(ref('AppConfig')), '01-app/GET.config.response.json'),
        ...authErrors,
      },
    },
  },
  '/app/bootstrap': {
    get: {
      tags: ['App'],
      summary: 'Bootstrap setelah splash / login',
      description: 'Menentukan layar berikutnya lewat `next_screen`: `P2H`, `DO_ASSIGNED`, atau `DO_ACTIVE`. '
        + 'Jika 401 `TOKEN_EXPIRED` panggil `POST /auth/refresh` lalu ulangi.',
      security: secured,
      responses: {
        200: jsonResponse('OK', envelope(ref('Bootstrap')), {
          'Belum P2H': '01-app/GET.bootstrap.response.belum-p2h.json',
          'Siap (ada DO ditugaskan)': '01-app/GET.bootstrap.response.siap.json',
          'DO sedang berjalan': '01-app/GET.bootstrap.response.do-berjalan.json',
        }),
        ...authErrors,
      },
    },
  },

  // ===================== Auth =====================
  '/auth/login': {
    post: {
      tags: ['Auth'],
      summary: 'Login driver',
      description: 'Login dengan kode driver atau No. HP. Dibatasi rate limit; setelah beberapa kali gagal akun dikunci sementara.',
      requestBody: jsonBody(ref('LoginRequest'), '02-auth/POST.login.request.json'),
      responses: {
        200: jsonResponse('Login berhasil', envelope(ref('LoginResponse')), '02-auth/POST.login.response.json'),
        401: jsonResponse('Kredensial salah', ref('Error'), '02-auth/POST.login.error.json'),
        422: errorRef('ValidationError'),
        429: errorRef('RateLimited'),
      },
    },
  },
  '/auth/refresh': {
    post: {
      tags: ['Auth'],
      summary: 'Perbarui access token',
      description: 'Refresh token dirotasi: token lama langsung tidak berlaku. Jika gagal (401 UNAUTHORIZED) arahkan ke Login.',
      requestBody: jsonBody(ref('RefreshRequest'), '02-auth/POST.refresh.request.json'),
      responses: {
        200: jsonResponse('OK', envelope(ref('TokenPair')), '02-auth/POST.refresh.response.json'),
        401: errorRef('Unauthorized'),
        429: errorRef('RateLimited'),
      },
    },
  },
  '/auth/logout': {
    post: {
      tags: ['Auth'],
      summary: 'Logout',
      description: 'Mencabut refresh token perangkat ini dan menghapus FCM token-nya.',
      security: secured,
      responses: {
        200: jsonResponse('OK', envelope(ref('LogoutResponse')), '02-auth/POST.logout.response.json'),
        ...authErrors,
      },
    },
  },

  // ===================== Akun =====================
  '/me': {
    get: {
      tags: ['Akun'],
      summary: 'Profil driver',
      security: secured,
      responses: {
        200: jsonResponse('OK', envelope(ref('Me')), '02-auth/GET.me.response.json'),
        ...authErrors,
      },
    },
  },
  '/me/settings': {
    patch: {
      tags: ['Akun'],
      summary: 'Ubah pengaturan (bahasa)',
      security: secured,
      requestBody: jsonBody(ref('SettingsRequest'), '02-auth/PATCH.me.settings.request.json'),
      responses: {
        200: jsonResponse('OK', envelope(ref('SettingsRequest')), '02-auth/PATCH.me.settings.response.json'),
        422: errorRef('ValidationError'),
        ...authErrors,
      },
    },
  },
  '/devices/push-token': {
    post: {
      tags: ['Akun'],
      summary: 'Daftarkan FCM token perangkat',
      description: 'Dipanggil setelah login dan setiap FCM token berubah. Payload push: lihat schema `PushDoAssigned` dan `PushP2hRecheckRequested`.',
      security: secured,
      requestBody: jsonBody(ref('PushTokenRequest'), '02-auth/POST.devices.push-token.request.json'),
      responses: {
        200: jsonResponse('OK', envelope(ref('PushTokenResponse')), '02-auth/POST.devices.push-token.response.json'),
        422: errorRef('ValidationError'),
        ...authErrors,
      },
    },
  },
}
