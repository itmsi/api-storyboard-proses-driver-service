const multer = require('multer')
const config = require('../config')
const { AppError } = require('../utils/errors')

/**
 * Upload foto ke memori (lalu disimpan lewat src/utils/storage.js).
 * Dipakai untuk POST /media: field file = "file".
 */
const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.upload.maxFileSize, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!config.upload.allowedMimeTypes.includes(file.mimetype)) {
      return cb(new AppError('UNSUPPORTED_MEDIA_TYPE', {
        details: { allowed: config.upload.allowedMimeTypes }
      }))
    }
    return cb(null, true)
  },
})

module.exports = { imageUpload }
