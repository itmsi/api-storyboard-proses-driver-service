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
      summary: 'Login (driver dan admin)',
      description: 'Satu endpoint untuk dua peran; peran dibaca dari akunnya. **Driver** (aplikasi HP): client code + ID driver atau No. HP + kata sandi + `device`. '
        + '**Admin** (web): client code + username atau email + kata sandi, tanpa `device`. Client code memilih database perusahaan; '
        + 'semua request berikutnya otomatis memakai database yang sama (client code tersimpan di token). '
        + 'Dibatasi rate limit; setelah beberapa kali gagal akun dikunci sementara (`details.remaining_attempts` menunjukkan sisa percobaan).',
      requestBody: jsonBody(ref('LoginRequest'), {
        Driver: '02-auth/POST.login.request.json',
        Admin: '02-auth/POST.login.request.admin.json',
      }),
      responses: {
        200: jsonResponse('Login berhasil', envelope(ref('LoginResponse')), {
          Driver: '02-auth/POST.login.response.json',
          Admin: '02-auth/POST.login.response.admin.json',
        }),
        401: jsonResponse('Kredensial / client code salah', ref('Error'), {
          INVALID_CREDENTIALS: '02-auth/POST.login.error.json',
          INVALID_CLIENT_CODE: '02-auth/POST.login.error.client-code.json',
        }),
        403: jsonResponse('Akun atau perusahaan nonaktif (FORBIDDEN / CLIENT_INACTIVE)', ref('Error')),
        422: errorRef('ValidationError'),
        423: jsonResponse('Akun terkunci sementara', ref('Error'), '02-auth/POST.login.error.locked.json'),
        503: jsonResponse('Database perusahaan tidak dapat dihubungi (TENANT_UNAVAILABLE)', ref('Error')),
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
      description: 'Driver: mencabut refresh token perangkat ini dan menghapus FCM token-nya (`pending_sync_warning` jika masih ada data offline yang belum terkirim). Admin: mencabut sesi ini.',
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
      summary: 'Profil akun yang login',
      description: 'Bentuk response mengikuti peran: driver mendapat `Me` (unit hari ini, aplikasi, sinkronisasi), admin mendapat `AdminProfile`.',
      security: secured,
      responses: {
        200: jsonResponse('OK', envelope({ oneOf: [ref('Me'), ref('AdminProfile')] }), '02-auth/GET.me.response.json'),
        ...authErrors,
      },
    },
  },
  '/me/settings': {
    put: {
      tags: ['Akun'],
      summary: 'Ubah pengaturan (bahasa)',
      security: secured,
      requestBody: jsonBody(ref('SettingsRequest'), '02-auth/PUT.me.settings.request.json'),
      responses: {
        200: jsonResponse('OK', envelope(ref('SettingsRequest')), '02-auth/PUT.me.settings.response.json'),
        422: errorRef('ValidationError'),
        ...authErrors,
      },
    },
  },
  '/me/password': {
    post: {
      tags: ['Akun'],
      summary: 'Ganti password sendiri',
      description: 'Untuk driver dan admin. Password baru minimal 8 karakter dan mengandung huruf dan angka. '
        + 'Sesi di perangkat lain dicabut; sesi yang sedang dipakai tetap berjalan.',
      security: secured,
      requestBody: jsonBody(ref('ChangePasswordRequest')),
      responses: {
        200: jsonResponse('OK', envelope({ type: 'object', properties: { changed: { type: 'boolean', example: true } } })),
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
