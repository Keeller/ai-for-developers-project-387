import {
  createBooking,
  createEventType,
  expect,
  makeEveryDayAvailable,
  openBookingForm,
  submitBooking,
  test,
} from './fixtures'

test('TC-E2E-07: Гость проходит полный сценарий Бронирования', async ({
  page,
  request,
}) => {
  await createEventType(request, {
    publicId: 'discovery-call',
    name: 'Знакомство',
    description: 'Короткий вводный разговор',
    durationMinutes: 30,
  })
  await makeEveryDayAvailable(request)

  await page.setViewportSize({ width: 390, height: 844 })
  await openBookingForm(page, {
    publicId: 'discovery-call',
    name: 'Знакомство',
  })
  await expect(page.getByText('Учебное демо без авторизации')).toBeVisible()
  await submitBooking(page, {
    name: 'Анна',
    email: 'anna@example.com',
  })

  await expect(
    page.getByRole('heading', { name: 'Бронирование подтверждено' }),
  ).toBeVisible()
  await expect(page.getByText('Знакомство', { exact: true })).toBeVisible()
  await expect(page.getByText('30 минут', { exact: true })).toBeVisible()
  await expect(page.getByText('Часовой пояс: Europe/Moscow')).toBeVisible()
  await expect(page).not.toHaveURL(/anna|example\.com/i)
})

test('TC-E2E-08: занятый Слот больше не предлагается Гостю', async ({
  page,
  request,
}) => {
  await createEventType(request, {
    publicId: 'busy-call',
    name: 'Занятый разговор',
  })
  await makeEveryDayAvailable(request)
  const bookedSlot = await createBooking(request, {
    eventTypePublicId: 'busy-call',
    guestName: 'Первый Гость',
    guestEmail: 'first@example.com',
  })

  await page.goto('/book/busy-call')
  await page.getByLabel('Часовой пояс гостя').fill('Europe/Moscow')
  await page.getByRole('button', { name: 'Показать время в этой зоне' }).click()

  const bookedDay = page.locator('section').filter({
    has: page.getByRole('heading', { name: bookedSlot.guestLocalDate }),
  })
  await expect(bookedDay.getByRole('button', { name: /^09:00 / })).toHaveCount(
    0,
  )
  await expect(bookedDay.getByRole('button', { name: /^09:30 / })).toBeVisible()
})

test('TC-E2E-09: конкурентное Бронирование другого Типа события отклоняется', async ({
  context,
  page,
  request,
}) => {
  await createEventType(request, {
    publicId: 'short-call',
    name: 'Короткий разговор',
    durationMinutes: 30,
  })
  await createEventType(request, {
    publicId: 'long-call',
    name: 'Длинный разговор',
    durationMinutes: 60,
  })
  await makeEveryDayAvailable(request)

  const secondGuestPage = await context.newPage()
  const shortCallSlot = await openBookingForm(page, {
    publicId: 'short-call',
    name: 'Короткий разговор',
  })
  const longCallSlot = await openBookingForm(secondGuestPage, {
    publicId: 'long-call',
    name: 'Длинный разговор',
  })
  expect(longCallSlot.guestLocalDate).toBe(shortCallSlot.guestLocalDate)

  await submitBooking(page, {
    name: 'Анна',
    email: 'anna@example.com',
  })
  await expect(
    page.getByRole('heading', { name: 'Бронирование подтверждено' }),
  ).toBeVisible()

  await submitBooking(secondGuestPage, {
    name: 'Борис',
    email: 'boris@example.com',
  })
  await expect(
    secondGuestPage.getByText('Слот уже недоступен. Выберите другой.'),
  ).toBeVisible()
  const refreshedDay = secondGuestPage.locator('section').filter({
    has: secondGuestPage.getByRole('heading', {
      name: shortCallSlot.guestLocalDate,
    }),
  })
  await expect(
    refreshedDay.getByRole('button', { name: /^09:00 / }),
  ).toHaveCount(0)
  await refreshedDay.getByRole('button', { name: /^09:30 / }).click()
  await expect(secondGuestPage.getByLabel('Имя')).toHaveValue('Борис')
  await expect(secondGuestPage.getByLabel('Email')).toHaveValue(
    'boris@example.com',
  )
})

test('TC-E2E-10: Владелец видит Бронирование в общем списке', async ({
  page,
  request,
}) => {
  await createEventType(request, {
    publicId: 'owner-list-call',
    name: 'Разговор из списка',
    durationMinutes: 45,
  })
  await makeEveryDayAvailable(request)
  await createBooking(request, {
    eventTypePublicId: 'owner-list-call',
    guestName: 'Елена',
    guestEmail: 'elena@example.com',
  })

  await page.goto('/manage/bookings')
  const booking = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: 'Разговор из списка' }),
  })
  await expect(booking).toContainText('45 минут')
  await expect(booking).toContainText('Елена')
  await expect(booking).toContainText('elena@example.com')
  await expect(booking).toContainText(/—/)
})

test('TC-E2E-11: подтверждение восстанавливается по прямой ссылке', async ({
  page,
  request,
}) => {
  await createEventType(request, {
    publicId: 'direct-call',
    name: 'Прямой разговор',
    durationMinutes: 30,
  })
  await makeEveryDayAvailable(request)

  await openBookingForm(page, {
    publicId: 'direct-call',
    name: 'Прямой разговор',
  })
  await submitBooking(page, {
    name: 'Анна',
    email: 'anna@example.com',
  })
  await expect(
    page.getByRole('heading', { name: 'Бронирование подтверждено' }),
  ).toBeVisible()

  const confirmationUrl = page.url()
  expect(confirmationUrl).toMatch(/\/book\/direct-call\/success\/[^/]+$/)

  await page.goto('/')
  await page.goto(confirmationUrl)

  await expect(
    page.getByRole('heading', { name: 'Бронирование подтверждено' }),
  ).toBeVisible()
  await expect(page.getByText('Прямой разговор', { exact: true })).toBeVisible()
  await expect(page.getByText('30 минут', { exact: true })).toBeVisible()
  await expect(page.getByText('Часовой пояс: Europe/Moscow')).toBeVisible()
})

test('TC-E2E-11 (неизвестное Бронирование): показано состояние «недоступно»', async ({
  page,
}) => {
  await page.goto('/book/unknown-call/success/unknown-booking-id')

  await expect(
    page.getByRole('heading', { name: 'Подтверждение недоступно' }),
  ).toBeVisible()
  await expect(
    page.getByRole('link', { name: 'Выбрать Тип события' }),
  ).toHaveAttribute('href', '/book')
})
