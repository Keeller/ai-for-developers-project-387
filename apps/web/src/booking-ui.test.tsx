// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import { MantineProvider } from '@mantine/core'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import {
  guestBookingsCreateBooking,
  guestEventTypesGetPublicEventType,
  guestEventTypesListAvailableSlots,
  guestEventTypesListPublicEventTypes,
  ownerBookingsListFutureBookings,
} from './api/client'

vi.mock('./api/client', () => ({
  guestBookingsCreateBooking: vi.fn(),
  guestEventTypesGetPublicEventType: vi.fn(),
  guestEventTypesListAvailableSlots: vi.fn(),
  guestEventTypesListPublicEventTypes: vi.fn(),
  ownerBookingsListFutureBookings: vi.fn(),
}))

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      addListener: () => undefined,
      dispatchEvent: () => false,
      removeEventListener: () => undefined,
      removeListener: () => undefined,
    }) as MediaQueryList,
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderApp(path: string) {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </MantineProvider>,
  )
}

describe('публичное Бронирование', () => {
  it('проводит Гостя от опубликованного Типа события до подтверждения', async () => {
    const user = userEvent.setup()
    vi.mocked(guestEventTypesListPublicEventTypes).mockResolvedValue({
      data: {
        items: [
          {
            publicId: 'discovery-call',
            name: 'Знакомство',
            description: 'Обсудим задачу',
            durationMinutes: 30,
          },
        ],
      },
      error: undefined,
    })
    vi.mocked(guestEventTypesGetPublicEventType).mockResolvedValue({
      data: {
        publicId: 'discovery-call',
        name: 'Знакомство',
        description: 'Обсудим задачу',
        durationMinutes: 30,
      },
      error: undefined,
    })
    vi.mocked(guestEventTypesListAvailableSlots).mockResolvedValue({
      data: {
        eventType: {
          publicId: 'discovery-call',
          name: 'Знакомство',
          durationMinutes: 30,
        },
        ownerTimeZone: 'Europe/Moscow',
        guestTimeZone: 'Europe/Moscow',
        slotStepMinutes: 30,
        horizonStartsOn: '2026-10-12',
        horizonEndsOn: '2026-10-25',
        generatedAt: '2026-10-12T05:00:00Z',
        days: [
          {
            ownerDate: '2026-10-12',
            slots: [
              {
                startAt: '2026-10-12T09:00:00Z',
                endAt: '2026-10-12T09:30:00Z',
                guestLocalDate: '2026-10-11',
                guestLocalStart: '12:00',
                guestUtcOffset: '+03:00',
              },
            ],
          },
        ],
      },
      error: undefined,
    })
    vi.mocked(guestBookingsCreateBooking).mockResolvedValue({
      data: {
        id: '0199d884-cd26-7000-8000-000000000001',
        eventType: {
          publicId: 'discovery-call',
          name: 'Знакомство',
          durationMinutes: 30,
        },
        startAt: '2026-10-12T09:00:00Z',
        endAt: '2026-10-12T09:30:00Z',
        guest: {
          name: 'Анна',
          email: 'anna@example.com',
          timeZone: 'Europe/Moscow',
        },
        createdAt: '2026-10-12T05:01:00Z',
      },
      error: undefined,
    })

    renderApp('/book')
    await user.click(await screen.findByRole('link', { name: /Знакомство/ }))
    expect(
      await screen.findByRole('heading', { name: '2026-10-11' }),
    ).toBeVisible()
    await user.click(await screen.findByRole('button', { name: /12:00/ }))
    await user.type(screen.getByLabelText(/Имя/), 'Анна')
    await user.type(screen.getByLabelText(/Email/), 'anna@example.com')
    await user.click(screen.getByRole('button', { name: 'Подтвердить' }))

    expect(
      await screen.findByRole('heading', { name: 'Бронирование подтверждено' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Знакомство')).toBeInTheDocument()
    expect(screen.getByText(/Europe\/Moscow/)).toBeInTheDocument()
  })

  it('сохраняет контакты и обновляет Слоты после конфликта Бронирования', async () => {
    const user = userEvent.setup()
    vi.mocked(guestEventTypesGetPublicEventType).mockResolvedValue({
      data: {
        publicId: 'discovery-call',
        name: 'Знакомство',
        durationMinutes: 30,
      },
      error: undefined,
    })
    vi.mocked(guestEventTypesListAvailableSlots)
      .mockResolvedValueOnce({
        data: {
          eventType: {
            publicId: 'discovery-call',
            name: 'Знакомство',
            durationMinutes: 30,
          },
          ownerTimeZone: 'Europe/Moscow',
          guestTimeZone: 'Europe/Moscow',
          slotStepMinutes: 30,
          horizonStartsOn: '2026-10-12',
          horizonEndsOn: '2026-10-25',
          generatedAt: '2026-10-12T05:00:00Z',
          days: [
            {
              ownerDate: '2026-10-12',
              slots: [
                {
                  startAt: '2026-10-12T09:00:00Z',
                  endAt: '2026-10-12T09:30:00Z',
                  guestLocalDate: '2026-10-12',
                  guestLocalStart: '12:00',
                  guestUtcOffset: '+03:00',
                },
              ],
            },
          ],
        },
        error: undefined,
      })
      .mockResolvedValueOnce({
        data: {
          eventType: {
            publicId: 'discovery-call',
            name: 'Знакомство',
            durationMinutes: 30,
          },
          ownerTimeZone: 'Europe/Moscow',
          guestTimeZone: 'Europe/Moscow',
          slotStepMinutes: 30,
          horizonStartsOn: '2026-10-12',
          horizonEndsOn: '2026-10-25',
          generatedAt: '2026-10-12T05:01:00Z',
          days: [
            {
              ownerDate: '2026-10-12',
              slots: [
                {
                  startAt: '2026-10-12T09:30:00Z',
                  endAt: '2026-10-12T10:00:00Z',
                  guestLocalDate: '2026-10-12',
                  guestLocalStart: '12:30',
                  guestUtcOffset: '+03:00',
                },
              ],
            },
          ],
        },
        error: undefined,
      })
    vi.mocked(guestBookingsCreateBooking).mockResolvedValue({
      data: undefined,
      error: {
        code: 'slot_unavailable',
        message: 'Слот уже недоступен. Выберите другой.',
      },
    })

    renderApp('/book/discovery-call')
    await user.click(await screen.findByRole('button', { name: /12:00/ }))
    await user.type(screen.getByLabelText(/Имя/), 'Борис')
    await user.type(screen.getByLabelText(/Email/), 'boris@example.com')
    await user.click(screen.getByRole('button', { name: 'Подтвердить' }))

    expect(
      await screen.findByText('Слот уже недоступен. Выберите другой.'),
    ).toBeVisible()
    expect(
      screen.queryByRole('button', { name: /12:00/ }),
    ).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /12:30/ }))
    expect(screen.getByLabelText(/Имя/)).toHaveValue('Борис')
    expect(screen.getByLabelText(/Email/)).toHaveValue('boris@example.com')
  })

  it('показывает Владельцу Бронирование в общем списке', async () => {
    vi.mocked(ownerBookingsListFutureBookings).mockResolvedValue({
      data: {
        calendarTimeZone: 'Europe/Moscow',
        items: [
          {
            id: '0199d884-cd26-7000-8000-000000000001',
            eventType: {
              publicId: 'discovery-call',
              name: 'Знакомство',
              durationMinutes: 30,
            },
            startAt: '2026-10-12T09:00:00Z',
            endAt: '2026-10-12T09:30:00Z',
            guest: {
              name: 'Анна',
              email: 'anna@example.com',
              timeZone: 'Europe/Moscow',
            },
            createdAt: '2026-10-12T05:01:00Z',
          },
        ],
      },
      error: undefined,
    })

    renderApp('/manage/bookings')

    expect(
      await screen.findByRole('heading', { name: 'Знакомство' }),
    ).toBeInTheDocument()
    expect(screen.getByText('anna@example.com')).toBeInTheDocument()
  })

  it('позволяет Владельцу повторить загрузку Бронирований после ошибки', async () => {
    const user = userEvent.setup()
    vi.mocked(ownerBookingsListFutureBookings)
      .mockResolvedValueOnce({
        data: undefined,
        error: {
          code: 'internal_error',
          message: 'Сервис временно недоступен.',
        },
      })
      .mockResolvedValueOnce({
        data: {
          calendarTimeZone: 'Europe/Moscow',
          items: [],
        },
        error: undefined,
      })

    renderApp('/manage/bookings')

    await user.click(await screen.findByRole('button', { name: 'Повторить' }))

    expect(
      await screen.findByText('Предстоящих Бронирований нет'),
    ).toBeInTheDocument()
    expect(ownerBookingsListFutureBookings).toHaveBeenCalledTimes(2)
  })

  it('не показывает подтверждение без данных Бронирования', () => {
    renderApp('/book/discovery-call/success')

    expect(
      screen.getByRole('heading', { name: 'Подтверждение недоступно' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Выбрать Тип события' }),
    ).toHaveAttribute('href', '/book')
  })
})
