/**
 * Jalankan migrasi / seed pada database tenant (client).
 *
 *   npm run migrate:tenant -- --client=OGO            # latest
 *   npm run migrate:tenant -- --all                   # semua tenant di registry
 *   npm run migrate:tenant -- --client=OGO --rollback
 *   npm run seed:tenant    -- --client=OGO
 *
 * Kredensial diambil dari TenantRegistry yang sama dengan API, jadi tidak ada konfigurasi ganda.
 */
const tenant = require('./tenant')
const migrator = require('./tenant/migrator')
const knexfile = require('./knexfile')

const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const option = (name) => (args.find((a) => a.startsWith(`--${name}=`)) || '').split('=')[1]

let action = 'latest'
if (flag('rollback')) action = 'rollback'
if (flag('seed')) action = 'seed'

const run = async (code) => {
  const db = await tenant.getDb(code, { allowInactive: true })
  const opts = { migrations: knexfile.migrations, seeds: knexfile.seeds }
  if (action === 'seed') {
    const [files] = await db.seed.run({ directory: opts.seeds.directory })
    console.log(`[${code}] seed: ${files.length} file`)
  } else if (action === 'rollback') {
    const [batch, files] = await db.migrate.rollback(opts.migrations)
    console.log(`[${code}] rollback batch ${batch}: ${files.length} file`)
  } else {
    const { batch, applied } = await migrator.migrateLatest(code)
    console.log(`[${code}] migrate batch ${batch}: ${applied.length ? applied.join(', ') : 'sudah terbaru'}`)
  }
};
(async () => {
  let codes
  if (flag('all')) codes = await tenant.listCodes()
  else if (option('client')) codes = [option('client')]
  else throw new Error('Gunakan --client=KODE atau --all')

  let failed = 0
  // eslint-disable-next-line no-restricted-syntax
  for (const code of codes) { // berurutan agar beban DB terkendali
    try {
      // eslint-disable-next-line no-await-in-loop
      await run(code)
    } catch (err) {
      failed += 1
      console.error(`[${code}] GAGAL: ${err.message}`)
    }
  }
  await tenant.closeAll()
  process.exit(failed ? 1 : 0)
})().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
