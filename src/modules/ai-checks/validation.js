const Joi = require('joi')

const idParams = Joi.object({
  id: Joi.string().guid().required(),
})

// Badan permintaan pengecekan (opsional): regenerate true = baca ulang foto yang hasilnya sudah ada (selesai); yang gagal selalu diantrekan ulang
const request = Joi.object({
  regenerate: Joi.boolean(),
}).options({ allowUnknown: false, stripUnknown: false })

module.exports = { idParams, request }
