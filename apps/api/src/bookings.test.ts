import { randomUUID } from 'node:crypto'

import { Client } from 'pg'
import { beforeEach, describe, expect, it } from 'vitest'

import { buildApp } from './app.js'

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  'postgres://calendar:test@127.0.0.1:55433/calendar_booking_test'

type SlotResponse = {
  days: Array<{ slots: Array<{ startAt: string }> }>
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

describe('Бронирования through real HTTP and PostgreSQL', () => {
  beforeEach(resetDatabase)

  it('атомарно допускает только одно глобально пересекающееся Бронирование', async () => {
    const run = await startApp()

    try {
      for (const eventType of [
        {
          publicId: 'short-call',
          name: 'Короткий звонок',
          durationMinutes: 30,
        },
        { publicId: 'long-call', name: 'Длинный звонок', durationMinutes: 60 },
      ]) {
        await fetch(`${run.baseUrl}/api/manage/event-types`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(eventType),
        })
      }
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
              weekday === 'monday' ? [{ start: '09:00', end: '12:00' }] : [],
          })),
        }),
      })

      const create = (eventTypePublicId: string, startAt: string) =>
        fetch(`${run.baseUrl}/api/bookings`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': randomUUID(),
          },
          body: JSON.stringify({
            eventTypePublicId,
            startAt,
            guestName: 'Анна',
            guestEmail: 'anna@example.com',
            guestTimeZone: 'Europe/Moscow',
          }),
        })
      const responses = await Promise.all([
        create('short-call', '2026-10-12T06:00:00.000Z'),
        create('long-call', '2026-10-12T06:15:00.000Z'),
      ])

      expect(
        responses
          .map((response) => response.status)
          .toSorted((left, right) => left - right),
      ).toEqual([201, 409])
      const conflict = responses.find((response) => response.status === 409)
      await expect(conflict?.json()).resolves.toMatchObject({
        code: 'slot_unavailable',
      })

      const slotsResponse = await fetch(
        `${run.baseUrl}/api/event-types/short-call/slots?guestTimeZone=Europe%2FMoscow`,
      )
      const slots = (await slotsResponse.json()) as SlotResponse
      expect(
        slots.days.flatMap((day) => day.slots.map((slot) => slot.startAt)),
      ).not.toContain('2026-10-12T06:00:00Z')
    } finally {
      await run.app.close()
    }
  })

  it('принимает только начала 30-минутной сетки от границы Доступности', async () => {
    const run = await startApp()

    try {
      await fetch(`${run.baseUrl}/api/manage/event-types`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          publicId: 'grid-call',
          name: 'Звонок по сетке',
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
              weekday === 'monday' ? [{ start: '09:15', end: '11:15' }] : [],
          })),
        }),
      })

      const create = (startAt: string) =>
        fetch(`${run.baseUrl}/api/bookings`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': randomUUID(),
          },
          body: JSON.stringify({
            eventTypePublicId: 'grid-call',
            startAt,
            guestName: 'Анна',
            guestEmail: 'anna@example.com',
            guestTimeZone: 'Europe/Moscow',
          }),
        })

      expect((await create('2026-10-12T06:45:00.000Z')).status).toBe(201)
      const offGridResponse = await create('2026-10-12T07:30:00.000Z')
      expect(offGridResponse.status).toBe(409)
      await expect(offGridResponse.json()).resolves.toMatchObject({
        code: 'slot_unavailable',
      })
    } finally {
      await run.app.close()
    }
  })

  it('показывает Владельцу будущие Бронирования со snapshot Типа события', async () => {
    const run = await startApp()

    try {
      await fetch(`${run.baseUrl}/api/manage/event-types`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          publicId: 'snapshot-call',
          name: 'Исходное название',
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
              weekday === 'monday' ? [{ start: '09:00', end: '12:00' }] : [],
          })),
        }),
      })
      await fetch(`${run.baseUrl}/api/bookings`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': randomUUID(),
        },
        body: JSON.stringify({
          eventTypePublicId: 'snapshot-call',
          startAt: '2026-10-12T06:00:00.000Z',
          guestName: 'Анна',
          guestEmail: 'anna@example.com',
          guestTimeZone: 'Europe/Moscow',
        }),
      })
      await fetch(`${run.baseUrl}/api/manage/event-types/snapshot-call`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: 'Новое название',
          durationMinutes: 60,
          publicationState: 'hidden',
        }),
      })

      const response = await fetch(`${run.baseUrl}/api/manage/bookings`)

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toMatchObject({
        calendarTimeZone: 'Europe/Moscow',
        items: [
          {
            eventType: {
              publicId: 'snapshot-call',
              name: 'Исходное название',
              durationMinutes: 30,
            },
            guest: { name: 'Анна', email: 'anna@example.com' },
          },
        ],
      })
    } finally {
      await run.app.close()
    }
  })

  it('проверяет Слот после атомарно завершённого изменения Доступности', async () => {
    const run = await startApp()
    const scheduler = new Client({ connectionString: databaseUrl })
    await scheduler.connect()

    try {
      await fetch(`${run.baseUrl}/api/manage/event-types`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          publicId: 'atomic-schedule-call',
          name: 'Атомарное расписание',
          durationMinutes: 30,
        }),
      })
      await fetch(`${run.baseUrl}/api/manage/availability`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          timeZone: 'Europe/Moscow',
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
            enabled: weekday === 'monday',
            intervals:
              weekday === 'monday' ? [{ start: '09:00', end: '12:00' }] : [],
          })),
        }),
      })

      await scheduler.query('BEGIN')
      await scheduler.query(
        `SELECT pg_advisory_xact_lock(hashtext('calendar-schedule'))`,
      )
      await scheduler.query('DELETE FROM weekly_availability_intervals')
      let settled = false
      const bookingResponsePromise = fetch(`${run.baseUrl}/api/bookings`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': randomUUID(),
        },
        body: JSON.stringify({
          eventTypePublicId: 'atomic-schedule-call',
          startAt: '2026-10-12T06:00:00.000Z',
          guestName: 'Анна',
          guestEmail: 'anna@example.com',
          guestTimeZone: 'Europe/Moscow',
        }),
      }).then((response) => {
        settled = true
        return response
      })

      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(settled).toBe(false)
      await scheduler.query('COMMIT')

      const bookingResponse = await bookingResponsePromise
      expect(bookingResponse.status).toBe(409)
      await expect(bookingResponse.json()).resolves.toMatchObject({
        code: 'slot_unavailable',
      })
    } finally {
      await scheduler.query('ROLLBACK')
      await scheduler.end()
      await run.app.close()
    }
  })

  it('безопасно повторяет тот же idempotency key и отклоняет другой payload', async () => {
    const run = await startApp()

    try {
      await fetch(`${run.baseUrl}/api/manage/event-types`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          publicId: 'retry-call',
          name: 'Повторяемый звонок',
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
              weekday === 'monday' ? [{ start: '09:00', end: '12:00' }] : [],
          })),
        }),
      })
      const key = randomUUID()
      const payload = {
        eventTypePublicId: 'retry-call',
        startAt: '2026-10-12T06:00:00.000Z',
        guestName: '  Анна  ',
        guestEmail: '  anna@example.com  ',
        guestTimeZone: 'Europe/Moscow',
      }
      const send = (body: typeof payload) =>
        fetch(`${run.baseUrl}/api/bookings`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'idempotency-key': key,
          },
          body: JSON.stringify(body),
        })

      const createdResponse = await send(payload)
      const created = (await createdResponse.json()) as {
        guest: { email: string; name: string }
        id: string
      }
      const replayResponse = await send(payload)

      expect(createdResponse.status).toBe(201)
      expect(created.guest.name).toBe('Анна')
      expect(created.guest.email).toBe('anna@example.com')
      expect(replayResponse.status).toBe(200)
      await expect(replayResponse.json()).resolves.toMatchObject({
        id: created.id,
      })

      const mismatchResponse = await send({
        ...payload,
        guestEmail: 'other@example.com',
      })
      expect(mismatchResponse.status).toBe(409)
      await expect(mismatchResponse.json()).resolves.toMatchObject({
        code: 'idempotency_mismatch',
      })
    } finally {
      await run.app.close()
    }
  })

  it('удаляет Бронирование через 30 дней после окончания', async () => {
    const run = await startApp()

    await fetch(`${run.baseUrl}/api/manage/event-types`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        publicId: 'retention-call',
        name: 'Временный звонок',
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
            weekday === 'monday' ? [{ start: '09:00', end: '12:00' }] : [],
        })),
      }),
    })
    await fetch(`${run.baseUrl}/api/bookings`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      body: JSON.stringify({
        eventTypePublicId: 'retention-call',
        startAt: '2026-10-12T06:00:00.000Z',
        guestName: 'Анна',
        guestEmail: 'anna@example.com',
        guestTimeZone: 'Europe/Moscow',
      }),
    })
    await run.app.close()

    const afterRetention = buildApp({
      databaseUrl,
      clock: () => new Date('2026-11-12T07:00:00.000Z'),
    })
    await afterRetention.listen({ host: '127.0.0.1', port: 0 })
    await afterRetention.close()

    const client = new Client({ connectionString: databaseUrl })
    await client.connect()

    try {
      const result = await client.query<{ count: string }>(
        'SELECT count(*)::text AS count FROM bookings',
      )
      expect(result.rows[0]?.count).toBe('0')
    } finally {
      await client.end()
    }
  })
})
