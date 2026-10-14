import {
  expect,
  test as playwrightTest,
  type APIRequestContext,
  type Page,
} from '@playwright/test'
import { Pool } from 'pg'

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  'postgres://calendar:test@127.0.0.1:55433/calendar_booking_test'

export const weekdays = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const

async function resetDatabase() {
  const pool = new Pool({ connectionString: databaseUrl })

  try {
    await pool.query(`
      TRUNCATE TABLE
        bookings,
        availability_exception_intervals,
        availability_exceptions,
        weekly_availability_intervals,
        event_types;
      UPDATE weekly_availability_days SET enabled = false;
      UPDATE calendar_settings
      SET time_zone = 'Europe/Moscow', updated_at = now();
    `)
  } finally {
    await pool.end()
  }
}

export const test = playwrightTest.extend<{ databaseReset: void }>({
  databaseReset: [
    async ({ request: _request }, use) => {
      void _request
      await resetDatabase()
      await use()
    },
    { auto: true },
  ],
})

export { expect }

export type EventTypeInput = {
  publicId: string
  name: string
  description?: string
  durationMinutes?: number
}

export async function createEventType(
  request: APIRequestContext,
  { publicId, name, description, durationMinutes = 30 }: EventTypeInput,
) {
  const response = await request.post('/api/manage/event-types', {
    data: {
      publicId,
      name,
      ...(description === undefined ? {} : { description }),
      durationMinutes,
    },
  })

  expect(response.status()).toBe(201)
}

export async function makeEveryDayAvailable(
  request: APIRequestContext,
  { start = '09:00', end = '12:00' } = {},
) {
  const response = await request.put('/api/manage/availability', {
    data: {
      timeZone: 'Europe/Moscow',
      week: weekdays.map((weekday) => ({
        weekday,
        enabled: true,
        intervals: [{ start, end }],
      })),
    },
  })

  expect(response.status()).toBe(200)
}

export async function openBookingForm(
  page: Page,
  { name, publicId, start = '09:00' }: EventTypeInput & { start?: string },
) {
  await page.goto('/book')
  await page.getByRole('link', { name: `Выбрать ${name}` }).click()
  await page.getByLabel('Часовой пояс гостя').fill('Europe/Moscow')
  await page.getByRole('button', { name: 'Показать время в этой зоне' }).click()

  const slot = page
    .getByRole('button', { name: new RegExp(`^${start} `) })
    .first()
  await expect(slot).toBeVisible()
  const guestLocalDate = await slot
    .locator('xpath=ancestor::section[1]')
    .getByRole('heading')
    .innerText()
  await slot.focus()
  await slot.press('Enter')
  await expect(page).toHaveURL(new RegExp(`/book/${publicId}$`))

  return { guestLocalDate }
}

export async function submitBooking(
  page: Page,
  { email, name }: { email: string; name: string },
) {
  await page.getByLabel('Имя').fill(name)
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Подтвердить' }).click()
}

export async function createBooking(
  request: APIRequestContext,
  {
    eventTypePublicId,
    guestEmail,
    guestName,
    start = '09:00',
  }: {
    eventTypePublicId: string
    guestEmail: string
    guestName: string
    start?: string
  },
) {
  const slotsResponse = await request.get(
    `/api/event-types/${eventTypePublicId}/slots?guestTimeZone=Europe%2FMoscow`,
  )
  expect(slotsResponse.status()).toBe(200)

  const slotWindow = (await slotsResponse.json()) as {
    days: Array<{
      slots: Array<{
        guestLocalDate: string
        guestLocalStart: string
        startAt: string
      }>
    }>
  }
  const slot = slotWindow.days
    .flatMap((day) => day.slots)
    .find((candidate) => candidate.guestLocalStart === start)

  expect(slot).toBeDefined()
  if (slot === undefined) throw new Error(`Expected a ${start} Slot`)

  const response = await request.post('/api/bookings', {
    data: {
      eventTypePublicId,
      startAt: slot.startAt,
      guestName,
      guestEmail,
      guestTimeZone: 'Europe/Moscow',
    },
    headers: { 'Idempotency-Key': crypto.randomUUID() },
  })

  expect(response.status()).toBe(201)
  return slot
}
