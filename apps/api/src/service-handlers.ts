import { Temporal } from '@js-temporal/polyfill'
import { createHash, randomUUID } from 'node:crypto'
import type { Pool, PoolClient } from 'pg'

import type { RouteHandlers } from './generated/fastify.gen.js'
import type {
  Availability,
  AvailabilityException,
  AvailabilityInterval,
  AvailableSlot,
  Booking,
  EventType,
  PublicEventType,
  ReplaceAvailabilityRequest,
  SlotDay,
  Weekday,
} from './generated/types.gen.js'

const databaseUnavailable = {
  code: 'internal_error' as const,
  message: 'База данных временно недоступна.',
}

const calendarScheduleLock = 'calendar-schedule'
const slotStepMinutes = 30 as const

type EventTypeRow = {
  created_at: Date
  description: string | null
  duration_minutes: EventType['durationMinutes']
  name: string
  publication_state: EventType['publicationState']
  public_id: string
  updated_at: Date
}

type BookingRow = {
  created_at: Date
  end_at: Date
  event_duration_minutes_snapshot: Booking['eventType']['durationMinutes']
  event_name_snapshot: string
  event_public_id_snapshot: string
  guest_email: string
  guest_name: string
  guest_time_zone: string
  id: string
  request_hash: string
  start_at: Date
}

type Queryable = Pick<Pool, 'query'> | Pick<PoolClient, 'query'>

async function withTransaction<Result>(
  database: Pool,
  operation: (client: PoolClient) => Promise<Result>,
): Promise<Result> {
  const client = await database.connect()

  try {
    await client.query('BEGIN')
    const result = await operation(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

async function lockCalendarScheduleForBooking(database: Queryable) {
  await database.query('SELECT pg_advisory_xact_lock_shared(hashtext($1))', [
    calendarScheduleLock,
  ])
}

async function lockCalendarScheduleForUpdate(database: Queryable) {
  await database.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
    calendarScheduleLock,
  ])
}

function toEventType(row: EventTypeRow): EventType {
  return {
    publicId: row.public_id,
    name: row.name,
    ...(row.description === null ? {} : { description: row.description }),
    durationMinutes: row.duration_minutes,
    publicationState: row.publication_state,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  }
}

function toPublicEventType(row: EventTypeRow): PublicEventType {
  return {
    publicId: row.public_id,
    name: row.name,
    ...(row.description === null ? {} : { description: row.description }),
    durationMinutes: row.duration_minutes,
  }
}

async function findEventType(
  database: Queryable,
  publicId: string,
): Promise<EventTypeRow | undefined> {
  const result = await database.query<EventTypeRow>(
    `
      SELECT public_id, name, description, duration_minutes,
             publication_state, created_at, updated_at
      FROM event_types WHERE public_id = $1
    `,
    [publicId],
  )
  return result.rows[0]
}

type PublicEventTypeLookup =
  | {
      error: {
        code: 'event_type_unavailable' | 'not_found'
        message: string
      }
      eventType: undefined
    }
  | { error: undefined; eventType: EventTypeRow }

function resolvePublicEventType(
  eventType: EventTypeRow | undefined,
): PublicEventTypeLookup {
  if (eventType === undefined) {
    return {
      error: {
        code: 'not_found' as const,
        message: 'Тип события не найден.',
      },
      eventType: undefined,
    }
  }

  if (eventType.publication_state !== 'published') {
    return {
      error: {
        code: 'event_type_unavailable' as const,
        message: 'Тип события недоступен.',
      },
      eventType: undefined,
    }
  }

  return { error: undefined, eventType }
}

function toBooking(row: BookingRow): Booking {
  return {
    id: row.id,
    eventType: {
      publicId: row.event_public_id_snapshot,
      name: row.event_name_snapshot,
      durationMinutes: row.event_duration_minutes_snapshot,
    },
    startAt: row.start_at.toISOString(),
    endAt: row.end_at.toISOString(),
    guest: {
      name: row.guest_name,
      email: row.guest_email,
      timeZone: row.guest_time_zone,
    },
    createdAt: row.created_at.toISOString(),
  }
}

const weekdays: Weekday[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]

type AvailabilityDayRow = {
  enabled: boolean
  end_time: string | null
  start_time: string | null
  weekday: Weekday
}

type AvailabilityExceptionRow = {
  date: string
  end_time: string | null
  mode: AvailabilityException['mode']
  start_time: string | null
  updated_at: Date
}

type BookingRange = {
  end_at: Date
  start_at: Date
}

type SlotGenerationOptions = {
  bookingRanges: BookingRange[]
  durationMinutes: number
  guestTimeZone: string
  now: Temporal.Instant
  ownerTimeZone: string
}

async function loadAvailability(database: Queryable): Promise<Availability> {
  const [settings, days] = await Promise.all([
    database.query<{ time_zone: string; updated_at: Date }>(`
      SELECT time_zone, updated_at FROM calendar_settings WHERE singleton = true
    `),
    database.query<AvailabilityDayRow>(`
      SELECT d.weekday, d.enabled,
             to_char(i.start_time, 'HH24:MI') AS start_time,
             to_char(i.end_time, 'HH24:MI') AS end_time
      FROM weekly_availability_days d
      LEFT JOIN weekly_availability_intervals i USING (weekday)
      ORDER BY array_position(
        ARRAY['monday', 'tuesday', 'wednesday', 'thursday',
              'friday', 'saturday', 'sunday'],
        d.weekday
      ), i.start_time
    `),
  ])
  const setting = settings.rows[0]

  if (setting === undefined) {
    throw new Error('Calendar settings are missing')
  }

  return {
    timeZone: setting.time_zone,
    updatedAt: setting.updated_at.toISOString(),
    week: weekdays.map((weekday) => {
      const rows = days.rows.filter((row) => row.weekday === weekday)
      return {
        weekday,
        enabled: rows[0]?.enabled ?? false,
        intervals: rows.flatMap((row) =>
          row.start_time === null || row.end_time === null
            ? []
            : [{ start: row.start_time, end: row.end_time }],
        ),
      }
    }),
  }
}

async function loadAvailabilityExceptions(
  database: Queryable,
): Promise<AvailabilityException[]> {
  const result = await database.query<AvailabilityExceptionRow>(`
    SELECT e.exception_date::text AS date, e.mode, e.updated_at,
           to_char(i.start_time, 'HH24:MI') AS start_time,
           to_char(i.end_time, 'HH24:MI') AS end_time
    FROM availability_exceptions e
    LEFT JOIN availability_exception_intervals i USING (exception_date)
    ORDER BY e.exception_date, i.start_time
  `)
  const byDate = new Map<string, AvailabilityException>()

  for (const row of result.rows) {
    const exception = byDate.get(row.date) ?? {
      date: row.date,
      mode: row.mode,
      intervals: [],
      updatedAt: row.updated_at.toISOString(),
    }

    if (row.start_time !== null && row.end_time !== null) {
      exception.intervals.push({ start: row.start_time, end: row.end_time })
    }

    byDate.set(row.date, exception)
  }

  return [...byDate.values()]
}

function validateIntervals(
  intervalsInput: Array<{ end: string; start: string }>,
  label: string,
) {
  const intervals = intervalsInput.map((interval) => ({
    start: Temporal.PlainTime.from(interval.start),
    end: Temporal.PlainTime.from(interval.end),
  }))

  for (const interval of intervals) {
    if (
      interval.start.minute % 15 !== 0 ||
      interval.end.minute % 15 !== 0 ||
      interval.start.second !== 0 ||
      interval.end.second !== 0 ||
      Temporal.PlainTime.compare(interval.start, interval.end) >= 0
    ) {
      return `Интервалы ${label} должны возрастать с шагом 15 минут.`
    }
  }

  const sorted = intervals.toSorted((left, right) =>
    Temporal.PlainTime.compare(left.start, right.start),
  )

  for (let index = 1; index < sorted.length; index += 1) {
    const previous = sorted[index - 1]
    const current = sorted[index]

    if (
      previous !== undefined &&
      current !== undefined &&
      Temporal.PlainTime.compare(current.start, previous.end) < 0
    ) {
      return `Интервалы ${label} не должны пересекаться.`
    }
  }

  return undefined
}

function validateAvailability(body: ReplaceAvailabilityRequest) {
  try {
    Temporal.Now.instant().toZonedDateTimeISO(body.timeZone)
  } catch {
    return 'Укажите существующий Часовой пояс календаря IANA.'
  }

  if (
    body.week.length !== weekdays.length ||
    new Set(body.week.map((day) => day.weekday)).size !== weekdays.length ||
    weekdays.some(
      (weekday) => !body.week.some((day) => day.weekday === weekday),
    )
  ) {
    return 'Нужно передать каждый день недели ровно один раз.'
  }

  for (const day of body.week) {
    if (!day.enabled && day.intervals.length > 0) {
      return `Выключенный день ${day.weekday} не может содержать интервалы.`
    }

    const validationMessage = validateIntervals(day.intervals, day.weekday)

    if (validationMessage !== undefined) {
      return validationMessage
    }
  }

  return undefined
}

function getEffectiveIntervals(
  weeklyDay: Availability['week'][number] | undefined,
  exception: AvailabilityException | undefined,
): AvailabilityInterval[] {
  if (exception?.mode === 'closed') {
    return []
  }

  if (exception?.mode === 'custom') {
    return exception.intervals
  }

  return weeklyDay?.enabled === true ? weeklyDay.intervals : []
}

function overlapsBooking(
  bookingRanges: BookingRange[],
  start: Temporal.Instant,
  end: Temporal.Instant,
) {
  return bookingRanges.some(
    (booking) =>
      Temporal.Instant.compare(
        Temporal.Instant.from(booking.start_at.toISOString()),
        end,
      ) < 0 &&
      Temporal.Instant.compare(
        Temporal.Instant.from(booking.end_at.toISOString()),
        start,
      ) > 0,
  )
}

function getIntervalEndInstant(
  ownerDate: Temporal.PlainDate,
  interval: AvailabilityInterval,
  ownerTimeZone: string,
) {
  return ownerDate
    .toPlainDateTime(Temporal.PlainTime.from(interval.end))
    .toZonedDateTime(ownerTimeZone, { disambiguation: 'later' })
    .toInstant()
}

function createAvailableSlot(
  localStart: Temporal.PlainDateTime,
  disambiguation: 'earlier' | 'later',
  intervalEnd: Temporal.Instant,
  seenStarts: Set<string>,
  options: SlotGenerationOptions,
): AvailableSlot | undefined {
  const zoned = localStart.toZonedDateTime(options.ownerTimeZone, {
    disambiguation,
  })

  if (!zoned.toPlainDateTime().equals(localStart)) {
    return undefined
  }

  const instant = zoned.toInstant()
  const startAt = instant.toString()
  const end = instant.add({ minutes: options.durationMinutes })

  if (
    Temporal.Instant.compare(instant, options.now) <= 0 ||
    Temporal.Instant.compare(end, intervalEnd) > 0 ||
    seenStarts.has(startAt) ||
    overlapsBooking(options.bookingRanges, instant, end)
  ) {
    return undefined
  }

  const guestTime = instant.toZonedDateTimeISO(options.guestTimeZone)
  return {
    startAt,
    endAt: end.toString(),
    guestLocalDate: guestTime.toPlainDate().toString(),
    guestLocalStart: guestTime
      .toPlainTime()
      .toString({ smallestUnit: 'minute' }),
    guestUtcOffset: guestTime.offset,
  }
}

function listSlotsForOwnerDate(
  ownerDate: Temporal.PlainDate,
  intervals: AvailabilityInterval[],
  options: SlotGenerationOptions,
): AvailableSlot[] {
  const slots: AvailableSlot[] = []
  const seenStarts = new Set<string>()

  for (const interval of intervals) {
    let localStart = ownerDate.toPlainDateTime(
      Temporal.PlainTime.from(interval.start),
    )
    const localEnd = ownerDate.toPlainDateTime(
      Temporal.PlainTime.from(interval.end),
    )
    const intervalEnd = getIntervalEndInstant(
      ownerDate,
      interval,
      options.ownerTimeZone,
    )

    while (Temporal.PlainDateTime.compare(localStart, localEnd) < 0) {
      for (const disambiguation of ['earlier', 'later'] as const) {
        const slot = createAvailableSlot(
          localStart,
          disambiguation,
          intervalEnd,
          seenStarts,
          options,
        )

        if (slot !== undefined) {
          seenStarts.add(slot.startAt)
          slots.push(slot)
        }
      }

      localStart = localStart.add({ minutes: slotStepMinutes })
    }
  }

  slots.sort((left, right) => left.startAt.localeCompare(right.startAt))
  return slots
}

async function isEligibleBookingStart(
  database: Queryable,
  eventType: EventTypeRow,
  start: Temporal.Instant,
  now: Temporal.Instant,
) {
  const availability = await loadAvailability(database)
  const firstOwnerDate = now
    .toZonedDateTimeISO(availability.timeZone)
    .toPlainDate()
  const lastOwnerDate = firstOwnerDate.add({ days: 13 })
  const ownerStart = start.toZonedDateTimeISO(availability.timeZone)
  const ownerDate = ownerStart.toPlainDate()

  if (
    Temporal.Instant.compare(start, now) <= 0 ||
    Temporal.PlainDate.compare(ownerDate, firstOwnerDate) < 0 ||
    Temporal.PlainDate.compare(ownerDate, lastOwnerDate) > 0
  ) {
    return false
  }

  const exception = (await loadAvailabilityExceptions(database)).find(
    (item) => item.date === ownerDate.toString(),
  )
  const weekday = weekdays[ownerDate.dayOfWeek - 1]
  const weeklyDay = availability.week.find((day) => day.weekday === weekday)
  const effectiveIntervals = getEffectiveIntervals(weeklyDay, exception)
  const localStart = ownerStart.toPlainDateTime()
  const end = start.add({ minutes: eventType.duration_minutes })
  const startsAtWholeMinute =
    localStart.second === 0 &&
    localStart.millisecond === 0 &&
    localStart.microsecond === 0 &&
    localStart.nanosecond === 0
  const fits = effectiveIntervals.some((interval) => {
    const intervalStart = ownerDate.toPlainDateTime(
      Temporal.PlainTime.from(interval.start),
    )
    const intervalEnd = ownerDate.toPlainDateTime(
      Temporal.PlainTime.from(interval.end),
    )
    const minutesFromIntervalStart =
      localStart.hour * 60 +
      localStart.minute -
      (intervalStart.hour * 60 + intervalStart.minute)
    return (
      startsAtWholeMinute &&
      Temporal.PlainDateTime.compare(localStart, intervalStart) >= 0 &&
      Temporal.PlainDateTime.compare(localStart, intervalEnd) < 0 &&
      minutesFromIntervalStart % slotStepMinutes === 0 &&
      Temporal.Instant.compare(
        end,
        getIntervalEndInstant(ownerDate, interval, availability.timeZone),
      ) <= 0
    )
  })

  if (!fits) {
    return false
  }

  const overlaps = await database.query<{ exists: boolean }>(
    `
      SELECT EXISTS (
        SELECT 1 FROM bookings
        WHERE tstzrange(start_at, end_at, '[)') && tstzrange($1, $2, '[)')
      ) AS exists
    `,
    [start.toString(), end.toString()],
  )

  return overlaps.rows[0]?.exists !== true
}

const bookingColumns = `
  id, event_public_id_snapshot, event_name_snapshot,
  event_duration_minutes_snapshot, start_at, end_at,
  guest_name, guest_email, guest_time_zone, request_hash, created_at
`

async function findBookingByIdempotencyKey(
  database: Queryable,
  idempotencyKey: string,
) {
  const result = await database.query<BookingRow>(
    `SELECT ${bookingColumns} FROM bookings WHERE idempotency_key = $1`,
    [idempotencyKey],
  )
  return result.rows[0]
}

async function findBookingById(database: Queryable, id: string) {
  const result = await database.query<BookingRow>(
    `SELECT ${bookingColumns} FROM bookings WHERE id = $1`,
    [id],
  )
  return result.rows[0]
}

type BookingGuest = {
  email: string
  name: string
  timeZone: string
}

type GuestValidationResult =
  | { error: { fieldErrors: Record<string, string[]> }; guest?: never }
  | { error?: never; guest: BookingGuest }

function containsWhitespace(value: string) {
  for (const character of value) {
    if (character.trim() === '') {
      return true
    }
  }

  return false
}

function isValidGuestEmail(email: string) {
  const atIndex = email.indexOf('@')
  const dotIndex = email.lastIndexOf('.')

  return (
    email.length <= 254 &&
    !containsWhitespace(email) &&
    atIndex > 0 &&
    atIndex === email.lastIndexOf('@') &&
    dotIndex > atIndex + 1 &&
    dotIndex < email.length - 1
  )
}

function validateBookingGuest(
  nameInput: string,
  emailInput: string,
  timeZone: string,
): GuestValidationResult {
  const name = nameInput.trim()
  const email = emailInput.trim()

  try {
    Temporal.Now.instant().toZonedDateTimeISO(timeZone)
  } catch {
    return {
      error: { fieldErrors: { guestTimeZone: ['Неизвестный часовой пояс.'] } },
    }
  }

  if (name.length === 0 || name.length > 100) {
    return {
      error: {
        fieldErrors: {
          guestName: [
            name.length === 0
              ? 'Введите имя.'
              : 'Имя не должно быть длиннее 100 символов.',
          ],
        },
      },
    }
  }

  if (!isValidGuestEmail(email)) {
    return {
      error: {
        fieldErrors: { guestEmail: ['Укажите корректный email.'] },
      },
    }
  }

  return { guest: { email, name, timeZone } }
}

export function createServiceHandlers(
  database?: Pool,
  clock: () => Date = () => new Date(),
): RouteHandlers {
  return {
    getHealth(_request, reply) {
      reply.code(200).send({
        status: 'ok',
        service: 'calendar-api',
      })
    },
    async guestBookingsGetBooking(request, reply) {
      if (database === undefined) {
        return reply.code(503).send(databaseUnavailable)
      }

      const booking = await findBookingById(database, request.params.id)

      if (booking === undefined) {
        return reply.code(404).send({
          code: 'not_found',
          message: 'Бронирование не найдено.',
        })
      }

      return reply.code(200).send(toBooking(booking))
    },
    async guestBookingsCreateBooking(request, reply) {
      if (database === undefined) {
        return reply.code(503).send(databaseUnavailable)
      }

      const headers = request.headers as Record<string, string | undefined>
      const idempotencyKey =
        headers['idempotency-key'] ?? headers['Idempotency-Key']

      if (idempotencyKey === undefined) {
        return reply.code(400).send({
          code: 'validation_error',
          message: 'Нужен idempotency key.',
          fieldErrors: { idempotencyKey: ['Заголовок обязателен.'] },
        })
      }

      const guestValidation = validateBookingGuest(
        request.body.guestName,
        request.body.guestEmail,
        request.body.guestTimeZone,
      )

      if (guestValidation.error !== undefined) {
        return reply.code(400).send({
          code: 'validation_error',
          message: 'Исправьте ошибки в полях.',
          fieldErrors: guestValidation.error.fieldErrors,
        })
      }

      const {
        email: guestEmail,
        name: guestName,
        timeZone: guestTimeZone,
      } = guestValidation.guest

      const normalizedPayload = {
        eventTypePublicId: request.body.eventTypePublicId,
        startAt: Temporal.Instant.from(request.body.startAt).toString(),
        guestName,
        guestEmail,
        guestTimeZone,
      }
      const requestHash = createHash('sha256')
        .update(JSON.stringify(normalizedPayload))
        .digest('hex')
      const client = await database.connect()

      try {
        await client.query('BEGIN')
        await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          idempotencyKey,
        ])
        const existing = await findBookingByIdempotencyKey(
          client,
          idempotencyKey,
        )

        if (existing !== undefined) {
          await client.query('COMMIT')

          if (existing.request_hash !== requestHash) {
            return await reply.code(409).send({
              code: 'idempotency_mismatch',
              message:
                'Этот idempotency key уже использован с другими данными.',
            })
          }

          return await reply.code(200).send(toBooking(existing))
        }

        await lockCalendarScheduleForBooking(client)

        const eventResult = await client.query<EventTypeRow>(
          `
          SELECT public_id, name, description, duration_minutes,
                 publication_state, created_at, updated_at
          FROM event_types WHERE public_id = $1
          FOR UPDATE
        `,
          [normalizedPayload.eventTypePublicId],
        )
        const eventType = eventResult.rows[0]

        if (eventType === undefined) {
          await client.query('ROLLBACK')
          return await reply.code(404).send({
            code: 'not_found',
            message: 'Тип события не найден.',
          })
        }

        if (eventType.publication_state !== 'published') {
          await client.query('ROLLBACK')
          return await reply.code(409).send({
            code: 'event_type_unavailable',
            message: 'Тип события недоступен.',
          })
        }

        const start = Temporal.Instant.from(normalizedPayload.startAt)
        const now = Temporal.Instant.from(clock().toISOString())

        if (!(await isEligibleBookingStart(client, eventType, start, now))) {
          await client.query('ROLLBACK')
          return await reply.code(409).send({
            code: 'slot_unavailable',
            message: 'Слот уже недоступен. Выберите другой.',
          })
        }

        const id = randomUUID()
        const end = start.add({ minutes: eventType.duration_minutes })
        const result = await client.query<BookingRow>(
          `
          INSERT INTO bookings (
            id, event_type_public_id, event_public_id_snapshot,
            event_name_snapshot, event_duration_minutes_snapshot,
            start_at, end_at, guest_name, guest_email, guest_time_zone,
            idempotency_key, request_hash
          )
          VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          RETURNING ${bookingColumns}
        `,
          [
            id,
            eventType.public_id,
            eventType.name,
            eventType.duration_minutes,
            start.toString(),
            end.toString(),
            guestName,
            guestEmail,
            normalizedPayload.guestTimeZone,
            idempotencyKey,
            requestHash,
          ],
        )
        await client.query('COMMIT')
        const booking = result.rows[0]

        if (booking === undefined) {
          throw new Error('PostgreSQL did not return the created booking')
        }

        return await reply.code(201).send(toBooking(booking))
      } catch (error) {
        await client.query('ROLLBACK')

        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          (error.code === '23P01' || error.code === '40P01')
        ) {
          return await reply.code(409).send({
            code: 'slot_unavailable',
            message: 'Слот уже недоступен. Выберите другой.',
          })
        }

        throw error
      } finally {
        client.release()
      }
    },
    async guestEventTypesListPublicEventTypes(_request, reply) {
      if (database === undefined) {
        return reply.code(503).send(databaseUnavailable)
      }

      const result = await database.query<EventTypeRow>(`
      SELECT public_id, name, description, duration_minutes,
             publication_state, created_at, updated_at
      FROM event_types
      WHERE publication_state = 'published'
      ORDER BY created_at, public_id
    `)

      return reply.code(200).send({
        items: result.rows.map(toPublicEventType),
      })
    },
    async guestEventTypesGetPublicEventType(request, reply) {
      if (database === undefined) {
        return reply.code(503).send(databaseUnavailable)
      }

      const eventTypeLookup = resolvePublicEventType(
        await findEventType(database, request.params.publicId),
      )

      if (eventTypeLookup.error !== undefined) {
        return reply.code(404).send(eventTypeLookup.error)
      }

      return reply.code(200).send(toPublicEventType(eventTypeLookup.eventType))
    },
    async guestEventTypesListAvailableSlots(request, reply) {
      if (database === undefined) {
        return reply.code(503).send(databaseUnavailable)
      }

      try {
        Temporal.Now.instant().toZonedDateTimeISO(request.query.guestTimeZone)
      } catch {
        return reply.code(400).send({
          code: 'validation_error',
          message: 'Укажите существующий Часовой пояс гостя IANA.',
          fieldErrors: { guestTimeZone: ['Неизвестный часовой пояс.'] },
        })
      }

      const eventTypeLookup = resolvePublicEventType(
        await findEventType(database, request.params.publicId),
      )

      if (eventTypeLookup.error !== undefined) {
        return reply.code(404).send(eventTypeLookup.error)
      }

      const { eventType } = eventTypeLookup

      const availability = await loadAvailability(database)
      const nowInstant = Temporal.Instant.from(clock().toISOString())
      const firstOwnerDate = nowInstant
        .toZonedDateTimeISO(availability.timeZone)
        .toPlainDate()
      const lastOwnerDate = firstOwnerDate.add({ days: 13 })
      const weekByDay = new Map(
        availability.week.map((day) => [day.weekday, day]),
      )
      const exceptionsByDate = new Map(
        (await loadAvailabilityExceptions(database)).map((item) => [
          item.date,
          item,
        ]),
      )
      const bookingRanges = await database.query<BookingRange>(
        'SELECT start_at, end_at FROM bookings',
      )
      const days: SlotDay[] = []
      const slotOptions: SlotGenerationOptions = {
        bookingRanges: bookingRanges.rows,
        durationMinutes: eventType.duration_minutes,
        guestTimeZone: request.query.guestTimeZone,
        now: nowInstant,
        ownerTimeZone: availability.timeZone,
      }

      for (let offset = 0; offset < 14; offset += 1) {
        const ownerDate = firstOwnerDate.add({ days: offset })
        const weekday = weekdays[ownerDate.dayOfWeek - 1]
        const day = weekday === undefined ? undefined : weekByDay.get(weekday)
        const exception = exceptionsByDate.get(ownerDate.toString())

        const effectiveIntervals = getEffectiveIntervals(day, exception)
        const slots = listSlotsForOwnerDate(
          ownerDate,
          effectiveIntervals,
          slotOptions,
        )

        if (slots.length > 0) {
          days.push({ ownerDate: ownerDate.toString(), slots })
        }
      }

      return reply.code(200).send({
        eventType: toPublicEventType(eventType),
        ownerTimeZone: availability.timeZone,
        guestTimeZone: request.query.guestTimeZone,
        slotStepMinutes,
        horizonStartsOn: firstOwnerDate.toString(),
        horizonEndsOn: lastOwnerDate.toString(),
        generatedAt: nowInstant.toString(),
        days,
      })
    },
    async ownerAvailabilityGetAvailability(_request, reply) {
      if (database === undefined) {
        return reply.code(503).send(databaseUnavailable)
      }

      return reply.code(200).send(await loadAvailability(database))
    },
    async ownerAvailabilityReplaceAvailability(request, reply) {
      if (database === undefined) {
        return reply.code(503).send(databaseUnavailable)
      }

      const validationMessage = validateAvailability(request.body)

      if (validationMessage !== undefined) {
        return reply.code(400).send({
          code: 'validation_error',
          message: 'Исправьте ошибки Доступности.',
          fieldErrors: { week: [validationMessage] },
        })
      }

      await withTransaction(database, async (client) => {
        await lockCalendarScheduleForUpdate(client)
        await client.query('DELETE FROM weekly_availability_intervals')

        for (const day of request.body.week) {
          await client.query(
            `UPDATE weekly_availability_days SET enabled = $1 WHERE weekday = $2`,
            [day.enabled, day.weekday],
          )

          for (const interval of day.intervals) {
            await client.query(
              `
              INSERT INTO weekly_availability_intervals
                (weekday, start_time, end_time)
              VALUES ($1, $2::time, $3::time)
            `,
              [day.weekday, interval.start, interval.end],
            )
          }
        }

        await client.query(
          `
          UPDATE calendar_settings
          SET time_zone = $1, updated_at = now()
          WHERE singleton = true
        `,
          [request.body.timeZone],
        )
      })

      return reply.code(200).send(await loadAvailability(database))
    },
    async ownerAvailabilityListAvailabilityExceptions(_request, reply) {
      if (database === undefined) {
        return reply.code(503).send(databaseUnavailable)
      }

      return reply.code(200).send({
        items: await loadAvailabilityExceptions(database),
      })
    },
    async ownerAvailabilityDeleteAvailabilityException(request, reply) {
      if (database === undefined) {
        return reply.code(503).send(databaseUnavailable)
      }

      const rowCount = await withTransaction(database, async (client) => {
        await lockCalendarScheduleForUpdate(client)
        const result = await client.query(
          'DELETE FROM availability_exceptions WHERE exception_date = $1::date',
          [request.params.date],
        )
        return result.rowCount
      })

      if (rowCount === 0) {
        return reply.code(404).send({
          code: 'not_found',
          message: 'Исключение доступности не найдено.',
        })
      }

      return reply.code(204).send()
    },
    async ownerAvailabilityPutAvailabilityException(request, reply) {
      if (database === undefined) {
        return reply.code(503).send(databaseUnavailable)
      }

      const validationMessage =
        request.body.mode === 'closed' && request.body.intervals.length > 0
          ? 'Закрытая дата не может содержать интервалы.'
          : validateIntervals(request.body.intervals, request.params.date)

      if (validationMessage !== undefined) {
        return reply.code(400).send({
          code: 'validation_error',
          message: 'Исправьте Исключение доступности.',
          fieldErrors: { intervals: [validationMessage] },
        })
      }

      await withTransaction(database, async (client) => {
        await lockCalendarScheduleForUpdate(client)
        await client.query(
          `
          INSERT INTO availability_exceptions (exception_date, mode)
          VALUES ($1::date, $2)
          ON CONFLICT (exception_date) DO UPDATE
          SET mode = EXCLUDED.mode, updated_at = now()
        `,
          [request.params.date, request.body.mode],
        )
        await client.query(
          `DELETE FROM availability_exception_intervals
         WHERE exception_date = $1::date`,
          [request.params.date],
        )

        for (const interval of request.body.intervals) {
          await client.query(
            `
            INSERT INTO availability_exception_intervals
              (exception_date, start_time, end_time)
            VALUES ($1::date, $2::time, $3::time)
          `,
            [request.params.date, interval.start, interval.end],
          )
        }
      })

      const saved = (await loadAvailabilityExceptions(database)).find(
        (item) => item.date === request.params.date,
      )

      if (saved === undefined) {
        throw new Error(
          'PostgreSQL did not return the saved availability exception',
        )
      }

      return reply.code(200).send(saved)
    },
    async ownerBookingsListFutureBookings(_request, reply) {
      if (database === undefined) {
        return reply.code(503).send(databaseUnavailable)
      }

      const result = await database.query<BookingRow>(
        `
        SELECT ${bookingColumns}
        FROM bookings
        WHERE start_at > $1::timestamptz
        ORDER BY start_at, id
      `,
        [clock().toISOString()],
      )
      const availability = await loadAvailability(database)

      return reply.code(200).send({
        calendarTimeZone: availability.timeZone,
        items: result.rows.map(toBooking),
      })
    },
    async ownerEventTypesListEventTypes(_request, reply) {
      if (database === undefined) {
        return reply.code(503).send(databaseUnavailable)
      }

      const result = await database.query<EventTypeRow>(`
      SELECT public_id, name, description, duration_minutes,
             publication_state, created_at, updated_at
      FROM event_types
      ORDER BY created_at, public_id
    `)

      return reply.code(200).send({ items: result.rows.map(toEventType) })
    },
    async ownerEventTypesCreateEventType(request, reply) {
      if (database === undefined) {
        return reply.code(503).send(databaseUnavailable)
      }

      const name = request.body.name.trim()
      const description = request.body.description?.trim()

      if (name.length < 3) {
        return reply.code(400).send({
          code: 'validation_error',
          message: 'Исправьте ошибки в полях.',
          fieldErrors: {
            name: ['Название должно содержать не менее 3 символов.'],
          },
        })
      }

      try {
        const result = await database.query<EventTypeRow>(
          `
          INSERT INTO event_types (
            public_id, name, description, duration_minutes
          )
          VALUES ($1, $2, $3, $4)
          RETURNING public_id, name, description, duration_minutes,
                    publication_state, created_at, updated_at
        `,
          [
            request.body.publicId,
            name,
            description === '' ? null : description,
            request.body.durationMinutes,
          ],
        )

        const created = result.rows[0]

        if (created === undefined) {
          throw new Error('PostgreSQL did not return the created event type')
        }

        return await reply.code(201).send(toEventType(created))
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === '23505'
        ) {
          return reply.code(409).send({
            code: 'duplicate_public_id',
            message: 'Тип события с таким публичным ID уже существует.',
            fieldErrors: {
              publicId: ['Выберите другой публичный ID.'],
            },
          })
        }

        throw error
      }
    },
    async ownerEventTypesDeleteEventType(request, reply) {
      if (database === undefined) {
        return reply.code(503).send(databaseUnavailable)
      }

      try {
        const rowCount = await withTransaction(database, async (client) => {
          await lockCalendarScheduleForUpdate(client)
          const result = await client.query(
            'DELETE FROM event_types WHERE public_id = $1',
            [request.params.publicId],
          )
          return result.rowCount
        })

        if (rowCount === 0) {
          return await reply.code(404).send({
            code: 'not_found',
            message: 'Тип события не найден.',
          })
        }

        return await reply.code(204).send()
      } catch (error) {
        if (
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === '23503'
        ) {
          return reply.code(409).send({
            code: 'event_type_has_bookings',
            message:
              'Тип события с Бронированиями нельзя удалить. Скройте его.',
          })
        }

        throw error
      }
    },
    async ownerEventTypesGetEventType(request, reply) {
      if (database === undefined) {
        return reply.code(503).send(databaseUnavailable)
      }

      const eventType = await findEventType(database, request.params.publicId)

      if (eventType === undefined) {
        return reply.code(404).send({
          code: 'not_found',
          message: 'Тип события не найден.',
        })
      }

      return reply.code(200).send(toEventType(eventType))
    },
    async ownerEventTypesUpdateEventType(request, reply) {
      if (database === undefined) {
        return reply.code(503).send(databaseUnavailable)
      }

      const assignments: string[] = []
      const values: unknown[] = []

      if (request.body.name !== undefined) {
        const name = request.body.name.trim()

        if (name.length < 3) {
          return reply.code(400).send({
            code: 'validation_error',
            message: 'Исправьте ошибки в полях.',
            fieldErrors: {
              name: ['Название должно содержать не менее 3 символов.'],
            },
          })
        }

        values.push(name)
        assignments.push(`name = $${String(values.length)}`)
      }

      if (request.body.description !== undefined) {
        values.push(request.body.description.trim() || null)
        assignments.push(`description = $${String(values.length)}`)
      }

      if (request.body.durationMinutes !== undefined) {
        values.push(request.body.durationMinutes)
        assignments.push(`duration_minutes = $${String(values.length)}`)
      }

      if (request.body.publicationState !== undefined) {
        values.push(request.body.publicationState)
        assignments.push(`publication_state = $${String(values.length)}`)
      }

      assignments.push('updated_at = now()')
      values.push(request.params.publicId)
      const result = await withTransaction(database, async (client) => {
        await lockCalendarScheduleForUpdate(client)
        return client.query<EventTypeRow>(
          `
          UPDATE event_types
          SET ${assignments.join(', ')}
          WHERE public_id = $${String(values.length)}
          RETURNING public_id, name, description, duration_minutes,
                    publication_state, created_at, updated_at
        `,
          values,
        )
      })
      const eventType = result.rows[0]

      if (eventType === undefined) {
        return reply.code(404).send({
          code: 'not_found',
          message: 'Тип события не найден.',
        })
      }

      return reply.code(200).send(toEventType(eventType))
    },
  }
}
