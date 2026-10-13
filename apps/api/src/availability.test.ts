import { Client } from 'pg'
import { beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from './app.js'

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  'postgres://calendar:test@127.0.0.1:55433/calendar_booking_test'

async function resetDatabase() {
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  await client.query('DROP SCHEMA public CASCADE')
  await client.query('CREATE SCHEMA public')
  await client.end()
}

async function startApp() {
  const app = buildApp({ databaseUrl })
  await app.listen({ host: '127.0.0.1', port: 0 })
  const address = app.server.address()

  if (address === null || typeof address === 'string') {
    throw new Error('The test server did not expose a TCP port')
  }

  return { app, baseUrl: `http://127.0.0.1:${String(address.port)}` }
}

const emptyWeek = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
].map((weekday) => ({ weekday, enabled: false, intervals: [] }))

describe('Доступность through real HTTP and PostgreSQL', () => {
  beforeEach(resetDatabase)

  it('начинается пустой и сохраняет недельные интервалы в выбранной IANA-зоне', async () => {
    const firstRun = await startApp()
    const initialResponse = await fetch(
      `${firstRun.baseUrl}/api/manage/availability`,
    )

    expect(initialResponse.status).toBe(200)
    await expect(initialResponse.json()).resolves.toMatchObject({
      timeZone: 'Europe/Moscow',
      week: emptyWeek,
    })

    const week = emptyWeek.map((day) =>
      day.weekday === 'monday'
        ? {
            weekday: day.weekday,
            enabled: true,
            intervals: [
              { start: '09:00', end: '12:00' },
              { start: '13:00', end: '17:00' },
            ],
          }
        : day,
    )
    const replaceResponse = await fetch(
      `${firstRun.baseUrl}/api/manage/availability`,
      {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ timeZone: 'Europe/Berlin', week }),
      },
    )

    expect(
      replaceResponse.status,
      JSON.stringify(await replaceResponse.clone().json()),
    ).toBe(200)
    await firstRun.app.close()

    const secondRun = await startApp()

    try {
      const savedResponse = await fetch(
        `${secondRun.baseUrl}/api/manage/availability`,
      )
      await expect(savedResponse.json()).resolves.toMatchObject({
        timeZone: 'Europe/Berlin',
        week,
      })
    } finally {
      await secondRun.app.close()
    }
  })
})
