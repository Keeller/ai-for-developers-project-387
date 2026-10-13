import { randomUUID } from 'node:crypto'

import { Client } from 'pg'
import { beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from './app.js'

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  'postgres://calendar:test@127.0.0.1:55433/calendar_booking_test'
const now = new Date('2026-10-12T06:30:00.000Z')

async function resetDatabase() {
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  await client.query('DROP SCHEMA public CASCADE')
  await client.query('CREATE SCHEMA public')
  await client.end()
}

async function startApp() {
  const app = buildApp({ databaseUrl, clock: () => now })
  await app.listen({ host: '127.0.0.1', port: 0 })
  const address = app.server.address()

  if (address === null || typeof address === 'string') {
    throw new Error('The test server did not expose a TCP port')
  }

  return { app, baseUrl: `http://127.0.0.1:${String(address.port)}` }
}

describe('публичные Слоты through real HTTP and PostgreSQL', () => {
  beforeEach(resetDatabase)

  it('показывает опубликованный Тип события и только будущие Слоты 14-дневного окна', async () => {
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
            enabled: weekday === 'monday',
            intervals:
              weekday === 'monday' ? [{ start: '09:00', end: '11:00' }] : [],
          })),
        }),
      })

      const publicResponse = await fetch(`${run.baseUrl}/api/event-types`)
      await expect(publicResponse.json()).resolves.toMatchObject({
        items: [{ publicId: 'discovery-call', name: 'Знакомство' }],
      })

      const slotsResponse = await fetch(
        `${run.baseUrl}/api/event-types/discovery-call/slots?guestTimeZone=UTC`,
      )

      expect(slotsResponse.status).toBe(200)
      await expect(slotsResponse.json()).resolves.toMatchObject({
        ownerTimeZone: 'Europe/Moscow',
        guestTimeZone: 'UTC',
        slotStepMinutes: 30,
        horizonStartsOn: '2026-10-12',
        horizonEndsOn: '2026-10-25',
        days: [
          {
            ownerDate: '2026-10-12',
            slots: [
              { startAt: '2026-10-12T07:00:00Z', guestLocalStart: '07:00' },
              { startAt: '2026-10-12T07:30:00Z', guestLocalStart: '07:30' },
            ],
          },
          { ownerDate: '2026-10-19' },
        ],
      })
    } finally {
      await run.app.close()
    }
  })

  it('возвращает обе реальные версии повторяющегося времени при переводе часов', async () => {
    const dstNow = new Date('2026-10-24T00:00:00.000Z')
    const app = buildApp({ databaseUrl, clock: () => dstNow })
    await app.listen({ host: '127.0.0.1', port: 0 })
    const address = app.server.address()

    if (address === null || typeof address === 'string') {
      throw new Error('The test server did not expose a TCP port')
    }

    const baseUrl = `http://127.0.0.1:${String(address.port)}`

    try {
      await fetch(`${baseUrl}/api/manage/event-types`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          publicId: 'dst-call',
          name: 'Перевод часов',
          durationMinutes: 30,
        }),
      })
      await fetch(`${baseUrl}/api/manage/availability`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          timeZone: 'Europe/Berlin',
          week: [
            'monday',
            'tuesday',
            'wednesday',
            'thursday',
            'friday',
            'saturday',
            'sunday',
          ].map((weekday) => ({
            weekday,
            enabled: weekday === 'sunday',
            intervals:
              weekday === 'sunday' ? [{ start: '02:00', end: '03:00' }] : [],
          })),
        }),
      })

      const response = await fetch(
        `${baseUrl}/api/event-types/dst-call/slots?guestTimeZone=Europe%2FBerlin`,
      )
      const payload = (await response.json()) as {
        days: Array<{
          ownerDate: string
          slots: Array<{
            guestLocalStart: string
            guestUtcOffset: string
            startAt: string
          }>
        }>
      }
      const repeatedTwoOClock = payload.days
        .find((day) => day.ownerDate === '2026-10-25')
        ?.slots.filter((slot) => slot.guestLocalStart === '02:00')

      expect(response.status).toBe(200)
      expect(
        repeatedTwoOClock?.map((slot) => ({
          startAt: slot.startAt,
          guestLocalStart: slot.guestLocalStart,
          guestUtcOffset: slot.guestUtcOffset,
        })),
      ).toEqual([
        {
          startAt: '2026-10-25T00:00:00Z',
          guestLocalStart: '02:00',
          guestUtcOffset: '+02:00',
        },
        {
          startAt: '2026-10-25T01:00:00Z',
          guestLocalStart: '02:00',
          guestUtcOffset: '+01:00',
        },
      ])
    } finally {
      await app.close()
    }
  })

  it('не выпускает реальную длительность Типа события за границу интерва в DST-gap', async () => {
    const dstNow = new Date('2026-03-28T00:00:00.000Z')
    const app = buildApp({ databaseUrl, clock: () => dstNow })
    await app.listen({ host: '127.0.0.1', port: 0 })
    const address = app.server.address()

    if (address === null || typeof address === 'string') {
      throw new Error('The test server did not expose a TCP port')
    }

    const baseUrl = `http://127.0.0.1:${String(address.port)}`

    try {
      await fetch(`${baseUrl}/api/manage/event-types`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          publicId: 'spring-forward-call',
          name: 'Весенний переход',
          durationMinutes: 60,
        }),
      })
      await fetch(`${baseUrl}/api/manage/availability`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          timeZone: 'Europe/Berlin',
          week: [
            'monday',
            'tuesday',
            'wednesday',
            'thursday',
            'friday',
            'saturday',
            'sunday',
          ].map((weekday) => ({
            weekday,
            enabled: weekday === 'sunday',
            intervals:
              weekday === 'sunday' ? [{ start: '01:30', end: '03:30' }] : [],
          })),
        }),
      })

      const response = await fetch(
        `${baseUrl}/api/event-types/spring-forward-call/slots?guestTimeZone=Europe%2FBerlin`,
      )
      const payload = (await response.json()) as {
        days: Array<{
          ownerDate: string
          slots: Array<{ guestLocalStart: string }>
        }>
      }
      const transitionDay = payload.days.find(
        (day) => day.ownerDate === '2026-03-29',
      )

      expect(response.status).toBe(200)
      expect(transitionDay?.slots.map((slot) => slot.guestLocalStart)).toEqual([
        '01:30',
      ])

      const staleCandidateResponse = await fetch(`${baseUrl}/api/bookings`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': randomUUID(),
        },
        body: JSON.stringify({
          eventTypePublicId: 'spring-forward-call',
          startAt: '2026-03-29T00:45:00.000Z',
          guestName: 'Анна',
          guestEmail: 'anna@example.com',
          guestTimeZone: 'Europe/Berlin',
        }),
      })

      expect(staleCandidateResponse.status).toBe(409)
      await expect(staleCandidateResponse.json()).resolves.toMatchObject({
        code: 'slot_unavailable',
      })
    } finally {
      await app.close()
    }
  })
})
