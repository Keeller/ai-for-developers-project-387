import { Client } from 'pg'
import { beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from './app.js'

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  'postgres://calendar:test@127.0.0.1:55433/calendar_booking_test'

async function resetDatabase() {
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()

  try {
    await client.query('DROP SCHEMA public CASCADE')
    await client.query('CREATE SCHEMA public')
  } finally {
    await client.end()
  }
}

async function startApp() {
  const app = buildApp({ databaseUrl })
  await app.listen({ host: '127.0.0.1', port: 0 })
  const address = app.server.address()

  if (address === null || typeof address === 'string') {
    throw new Error('The test server did not expose a TCP port')
  }

  return {
    app,
    baseUrl: `http://127.0.0.1:${String(address.port)}`,
  }
}

describe('Типы событий through real HTTP and PostgreSQL', () => {
  beforeEach(resetDatabase)

  it('создаёт опубликованный Тип события и сохраняет его после перезапуска', async () => {
    const firstRun = await startApp()

    const createResponse = await fetch(
      `${firstRun.baseUrl}/api/manage/event-types`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          publicId: 'discovery-call',
          name: 'Знакомство',
          description: 'Первый разговор',
          durationMinutes: 30,
        }),
      },
    )

    expect(createResponse.status).toBe(201)
    await expect(createResponse.json()).resolves.toMatchObject({
      publicId: 'discovery-call',
      name: 'Знакомство',
      description: 'Первый разговор',
      durationMinutes: 30,
      publicationState: 'published',
    })
    await firstRun.app.close()

    const secondRun = await startApp()

    try {
      const listResponse = await fetch(
        `${secondRun.baseUrl}/api/manage/event-types`,
      )

      expect(listResponse.status).toBe(200)
      await expect(listResponse.json()).resolves.toMatchObject({
        items: [
          {
            publicId: 'discovery-call',
            name: 'Знакомство',
            publicationState: 'published',
          },
        ],
      })
    } finally {
      await secondRun.app.close()
    }
  })

  it('возвращает стабильную ошибку поля для недопустимого публичного ID', async () => {
    const run = await startApp()

    try {
      const response = await fetch(`${run.baseUrl}/api/manage/event-types`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          publicId: 'Bad ID',
          name: 'Знакомство',
          durationMinutes: 30,
        }),
      })

      expect(response.status).toBe(400)
      const body = (await response.json()) as {
        code: string
        fieldErrors: Record<string, string[]>
        message: string
      }
      expect(body.code).toBe('validation_error')
      expect(body.message.length).toBeGreaterThan(0)
      expect(body.fieldErrors.publicId?.[0]?.length).toBeGreaterThan(0)
    } finally {
      await run.app.close()
    }
  })

  it('редактирует, скрывает и удаляет неиспользованный Тип события', async () => {
    const run = await startApp()

    try {
      await fetch(`${run.baseUrl}/api/manage/event-types`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          publicId: 'discovery-call',
          name: 'Знакомство',
          durationMinutes: 30,
        }),
      })

      const updateResponse = await fetch(
        `${run.baseUrl}/api/manage/event-types/discovery-call`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            name: 'Подробное знакомство',
            durationMinutes: 45,
            publicationState: 'hidden',
          }),
        },
      )

      expect(updateResponse.status).toBe(200)
      await expect(updateResponse.json()).resolves.toMatchObject({
        publicId: 'discovery-call',
        name: 'Подробное знакомство',
        durationMinutes: 45,
        publicationState: 'hidden',
      })

      const deleteResponse = await fetch(
        `${run.baseUrl}/api/manage/event-types/discovery-call`,
        { method: 'DELETE' },
      )

      expect(deleteResponse.status).toBe(204)
      const missingResponse = await fetch(
        `${run.baseUrl}/api/manage/event-types/discovery-call`,
      )
      expect(missingResponse.status).toBe(404)
    } finally {
      await run.app.close()
    }
  })
})
