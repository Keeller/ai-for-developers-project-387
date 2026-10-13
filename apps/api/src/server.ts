import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildApp } from './app.js'

const host = process.env.HOST ?? '127.0.0.1'
const port = Number.parseInt(process.env.PORT ?? '3000', 10)
const currentDirectory = dirname(fileURLToPath(import.meta.url))
const staticRoot =
  process.env.NODE_ENV === 'production'
    ? (process.env.STATIC_ROOT ?? resolve(currentDirectory, '../../web/dist'))
    : undefined
const app = buildApp({
  server: { logger: true },
  staticRoot,
})

try {
  await app.listen({ host, port })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
