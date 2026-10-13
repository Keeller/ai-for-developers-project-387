import { Client } from 'pg'
import { beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from './app.js'

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  'postgres://calendar:test@127.0.0.1:55433/calendar_booking_test'

type SlotResponse = {
  days: Array<{
    ownerDate: string
    slots: Array<{ guestLocalStart: string }>
  }>
}

async function resetDatabase() {
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  await client.query('DROP SCHEMA public CASCADE')
  await client.query('CREATE SCHEMA public')
  await client.end()
}

async function startApp() {
  const app = buildApp({
    databaseUrl,
    clock: () => new Date('2026-10-12T05:00:00.000Z'),
  })
  await app.listen({ host: '127.0.0.1', port: 0 })
  const address = app.server.address()

  if (address === null || typeof address === 'string') {
    throw new Error('The test server did not expose a TCP port')
  }

  return { app, baseUrl: `http://127.0.0.1:${String(address.port)}` }
}

describe('Исключения доступности through real HTTP and PostgreSQL', () => {
  beforeEach(resetDatabase)

  it('закрывает дату, заменяет недельные интервалы и восстанавливает их после удаления', async () => {
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
      const weekdays = [
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
        'sunday',
      ]
      await fetch(`${run.baseUrl}/api/manage/availability`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          timeZone: 'Europe/Moscow',
          week: weekdays.map((weekday) => ({
            weekday,
            enabled: true,
            intervals: [{ start: '09:00', end: '10:00' }],
          })),
        }),
      })

      const closedResponse = await fetch(
        `${run.baseUrl}/api/manage/availability/exceptions/2026-10-12`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ mode: 'closed', intervals: [] }),
        },
      )
      expect(closedResponse.status).toBe(200)

      await fetch(
        `${run.baseUrl}/api/manage/availability/exceptions/2026-10-13`,
        {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            mode: 'custom',
            intervals: [{ start: '12:00', end: '13:00' }],
          }),
        },
      )

      const slotsResponse = await fetch(
        `${run.baseUrl}/api/event-types/discovery-call/slots?guestTimeZone=Europe%2FMoscow`,
      )
      const slots = (await slotsResponse.json()) as SlotResponse
      expect(slots.days[0]?.ownerDate).toBe('2026-10-13')
      expect(slots.days[0]?.slots[0]).toMatchObject({
        guestLocalStart: '12:00',
      })

      const deleteResponse = await fetch(
        `${run.baseUrl}/api/manage/availability/exceptions/2026-10-13`,
        { method: 'DELETE' },
      )
      expect(deleteResponse.status).toBe(204)

      const restoredSlotsResponse = await fetch(
        `${run.baseUrl}/api/event-types/discovery-call/slots?guestTimeZone=Europe%2FMoscow`,
      )
      const restoredSlots = (await restoredSlotsResponse.json()) as SlotResponse
      expect(restoredSlots.days[0]?.ownerDate).toBe('2026-10-13')
      expect(restoredSlots.days[0]?.slots[0]).toMatchObject({
        guestLocalStart: '09:00',
      })
    } finally {
      await run.app.close()
    }
  })
})
