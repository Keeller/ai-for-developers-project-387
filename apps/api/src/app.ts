import fastifyStatic from '@fastify/static'
import fastify, { type FastifyError, type FastifyServerOptions } from 'fastify'
import openapiGlue from 'fastify-openapi-glue'
import { fileURLToPath } from 'node:url'

import {
  cleanupExpiredBookings,
  createDatabasePool,
  migrateDatabase,
} from './database.js'
import { createServiceHandlers } from './service-handlers.js'

const openapiSpecification = fileURLToPath(
  new URL(
    '../../../packages/api-contract/generated/openapi.yaml',
    import.meta.url,
  ),
)

type BuildAppOptions = {
  clock?: () => Date
  databaseUrl?: string
  server?: FastifyServerOptions
  staticRoot?: string
}

export function buildApp({
  clock,
  databaseUrl = process.env.DATABASE_URL,
  server = {},
  staticRoot,
}: BuildAppOptions = {}) {
  const app = fastify(server)
  const getCurrentDate = clock ?? (() => new Date())
  const database =
    databaseUrl === undefined ? undefined : createDatabasePool(databaseUrl)

  app.setErrorHandler((error: FastifyError, _request, reply) => {
    if (error.validation !== undefined) {
      const fieldErrors: Record<string, string[]> = {}

      for (const issue of error.validation) {
        const missingProperty =
          typeof issue.params.missingProperty === 'string'
            ? issue.params.missingProperty
            : undefined
        const pathField = issue.instancePath.split('/').filter(Boolean).at(-1)
        const field = missingProperty ?? pathField ?? 'request'
        const messages = fieldErrors[field] ?? []
        messages.push(issue.message ?? 'Недопустимое значение.')
        fieldErrors[field] = messages
      }

      return reply.code(400).send({
        code: 'validation_error',
        message: 'Исправьте ошибки в полях.',
        fieldErrors,
      })
    }

    app.log.error(error)
    return reply.code(503).send({
      code: 'internal_error',
      message: 'Временная ошибка сервиса. Повторите попытку.',
    })
  })

  app.register(openapiGlue, {
    specification: openapiSpecification,
    serviceHandlers: createServiceHandlers(database, getCurrentDate),
  })

  if (database !== undefined) {
    let cleanupTimer: NodeJS.Timeout | undefined

    app.addHook('onReady', async () => {
      await migrateDatabase(database)

      try {
        await cleanupExpiredBookings(database, getCurrentDate())
      } catch (error) {
        app.log.error(error, 'Booking retention cleanup failed')
      }

      cleanupTimer = setInterval(
        () => {
          void cleanupExpiredBookings(database, getCurrentDate()).catch(
            (error: unknown) => {
              app.log.error(error, 'Booking retention cleanup failed')
            },
          )
        },
        60 * 60 * 1000,
      )
      cleanupTimer.unref()
    })
    app.addHook('onClose', async () => {
      if (cleanupTimer !== undefined) {
        clearInterval(cleanupTimer)
      }

      await database.end()
    })
  }

  if (staticRoot !== undefined) {
    app.register(fastifyStatic, {
      root: staticRoot,
      index: 'index.html',
    })

    app.setNotFoundHandler((request, reply) => {
      if (request.url === '/api' || request.url.startsWith('/api/')) {
        return reply.code(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Route ${request.method}:${request.url} not found`,
        })
      }

      return reply.type('text/html').sendFile('index.html')
    })
  }

  return app
}
