/**
 * Contoh request di Swagger. Setiap request body JSON yang belum punya contoh diberi contoh yang dibuat dari skemanya
 * (nilai `example` tiap field, atau nilai bawaan/enum pertama). Body daftar (POST /<modul>/get) diberi beberapa contoh bernama:
 * semua data, halaman dan urutan, serta dengan filter.
 */
const PLACEHOLDER = {
  uuid: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  date: '2026-11-12',
  'date-time': '2026-11-12T08:00:00+07:00',
  password: 'PasswordAwal1',
}

const createGenerator = (schemas) => {
  const resolve = (schema) => {
    if (schema && schema.$ref) return schemas[schema.$ref.split('/').pop()]
    return schema
  }

  const exampleOf = (input, depth = 0) => {
    const schema = resolve(input)
    if (!schema || depth > 6) return undefined
    if (schema.example !== undefined) return schema.example
    if (schema.allOf) {
      return schema.allOf.reduce((merged, part) => {
        const value = exampleOf(part, depth + 1)
        return value && typeof value === 'object' && !Array.isArray(value) ? { ...merged, ...value } : merged
      }, {})
    }
    if (schema.oneOf) return exampleOf(schema.oneOf[0], depth + 1)
    if (schema.enum) return schema.enum[0]
    if (schema.default !== undefined) return schema.default
    if (schema.type === 'array') {
      const item = exampleOf(schema.items, depth + 1)
      return item === undefined ? [] : [item]
    }
    if (schema.type === 'object' || schema.properties) {
      const out = {}
      Object.entries(schema.properties || {}).forEach(([key, prop]) => {
        const value = exampleOf(prop, depth + 1)
        if (value !== undefined) out[key] = value
      })
      return out
    }
    if (schema.type === 'string') return PLACEHOLDER[schema.format] || 'string'
    if (schema.type === 'integer' || schema.type === 'number') return schema.minimum !== undefined ? schema.minimum : 0
    if (schema.type === 'boolean') return true
    return undefined
  }

  return { resolve, exampleOf }
}

const isListBody = (schema) => Boolean(schema && schema.properties && schema.properties.page && schema.properties.limit)

/** Contoh bernama untuk body daftar. */
const listExamples = (schema, exampleOf) => {
  const props = schema.properties
  const filters = Object.entries(props).filter(([key]) => !['page', 'limit', 'search', 'sort'].includes(key))
  const withFilters = {
    page: 1, limit: 20, ...(props.search ? { search: props.search.example || 'cari' } : {}),
  }
  filters.forEach(([key, prop]) => {
    const value = exampleOf(prop)
    if (value !== undefined) withFilters[key] = value
  })
  const paged = { page: 1, limit: 20, ...(props.sort && props.sort.example ? { sort: props.sort.example } : {}) }
  return {
    'Semua data': { summary: 'Tanpa filter (body boleh kosong)', value: {} },
    'Halaman dan urutan': { summary: 'Paginasi dan urutan', value: paged },
    'Dengan pencarian dan filter': { summary: 'Pencarian dan filter (nilai contoh, sesuaikan)', value: withFilters },
  }
}

const addBodyExamples = (paths, schemas) => {
  const { resolve, exampleOf } = createGenerator(schemas)
  Object.values(paths).forEach((item) => {
    Object.values(item).forEach((operation) => {
      const content = operation && operation.requestBody && operation.requestBody.content
      const json = content && content['application/json']
      if (!json || json.example !== undefined || json.examples) return
      const schema = resolve(json.schema)
      if (isListBody(schema)) {
        json.examples = listExamples(schema, exampleOf)
        return
      }
      const value = exampleOf(json.schema)
      if (value !== undefined) json.example = value
    })
  })
  return paths
}

module.exports = { addBodyExamples }
