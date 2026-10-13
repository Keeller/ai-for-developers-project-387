// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import { MantineProvider } from '@mantine/core'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import {
  ownerAvailabilityDeleteAvailabilityException,
  ownerAvailabilityGetAvailability,
  ownerAvailabilityListAvailabilityExceptions,
  ownerAvailabilityPutAvailabilityException,
  ownerAvailabilityReplaceAvailability,
  type WeeklyAvailabilityDay,
} from './api/client'

vi.mock('./api/client', () => ({
  ownerAvailabilityDeleteAvailabilityException: vi.fn(),
  ownerAvailabilityGetAvailability: vi.fn(),
  ownerAvailabilityListAvailabilityExceptions: vi.fn(),
  ownerAvailabilityPutAvailabilityException: vi.fn(),
  ownerAvailabilityReplaceAvailability: vi.fn(),
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

const week: WeeklyAvailabilityDay[] = [
  {
    weekday: 'monday',
    enabled: true,
    intervals: [{ start: '09:00', end: '17:00' }],
  },
  { weekday: 'tuesday', enabled: false, intervals: [] },
  { weekday: 'wednesday', enabled: false, intervals: [] },
  { weekday: 'thursday', enabled: false, intervals: [] },
  { weekday: 'friday', enabled: false, intervals: [] },
  { weekday: 'saturday', enabled: false, intervals: [] },
  { weekday: 'sunday', enabled: false, intervals: [] },
]

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.restoreAllMocks()
})

function arrangeAvailability() {
  vi.mocked(ownerAvailabilityGetAvailability).mockResolvedValue({
    data: {
      timeZone: 'Europe/Moscow',
      week,
      updatedAt: '2026-10-12T10:00:00.000Z',
    },
    error: undefined,
  })
  vi.mocked(ownerAvailabilityListAvailabilityExceptions).mockResolvedValue({
    data: { items: [] },
    error: undefined,
  })
}

function renderPage() {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={['/manage/availability']}>
        <App />
      </MemoryRouter>
    </MantineProvider>,
  )
}

describe('управление Доступностью', () => {
  it('Владелец изменяет недельную Доступность и Часовой пояс календаря', async () => {
    arrangeAvailability()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.mocked(ownerAvailabilityReplaceAvailability).mockImplementation(
      ({ body }) =>
        Promise.resolve({
          data: {
            ...body,
            updatedAt: '2026-10-12T10:05:00.000Z',
          },
          error: undefined,
        }),
    )
    const user = userEvent.setup()

    renderPage()

    const monday = await screen.findByLabelText('Понедельник')
    expect(monday).toBeChecked()

    await user.click(monday)
    expect(monday).not.toBeChecked()
    await user.click(monday)
    await user.click(screen.getByRole('button', { name: 'Добавить интервал' }))

    fireEvent.change(screen.getByLabelText('Понедельник: начало 1'), {
      target: { value: '10:00' },
    })
    fireEvent.change(screen.getByLabelText('Понедельник: окончание 1'), {
      target: { value: '16:00' },
    })
    await user.selectOptions(
      screen.getByLabelText('Часовой пояс календаря'),
      'Asia/Tokyo',
    )
    await user.click(
      screen.getByRole('button', { name: 'Сохранить Доступность' }),
    )

    await waitFor(() => {
      expect(ownerAvailabilityReplaceAvailability).toHaveBeenCalledWith({
        body: {
          timeZone: 'Asia/Tokyo',
          week: [
            {
              weekday: 'monday',
              enabled: true,
              intervals: [{ start: '10:00', end: '16:00' }],
            },
            ...week.slice(1),
          ],
        },
      })
    })
    expect(confirm).toHaveBeenCalledOnce()
    expect(screen.getByText('Доступность сохранена.')).toBeInTheDocument()
  })

  it('Владелец создаёт особые часы и удаляет Исключение доступности с подтверждением', async () => {
    arrangeAvailability()
    vi.mocked(ownerAvailabilityListAvailabilityExceptions).mockResolvedValue({
      data: {
        items: [
          {
            date: '2026-10-20',
            mode: 'closed',
            intervals: [],
            updatedAt: '2026-10-12T10:00:00.000Z',
          },
        ],
      },
      error: undefined,
    })
    vi.mocked(ownerAvailabilityPutAvailabilityException).mockResolvedValue({
      data: {
        date: '2026-10-21',
        mode: 'custom',
        intervals: [{ start: '11:00', end: '15:00' }],
        updatedAt: '2026-10-12T10:05:00.000Z',
      },
      error: undefined,
    })
    vi.mocked(ownerAvailabilityDeleteAvailabilityException).mockResolvedValue({
      data: undefined,
      error: undefined,
    })
    const confirm = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true)
    const user = userEvent.setup()

    renderPage()

    expect(await screen.findByText('2026-10-20: закрыто')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/Дата исключения/), {
      target: { value: '2026-10-21' },
    })
    await user.selectOptions(
      screen.getByLabelText('Режим исключения'),
      'custom',
    )
    fireEvent.change(screen.getByLabelText('Начало исключения'), {
      target: { value: '11:00' },
    })
    fireEvent.change(screen.getByLabelText('Окончание исключения'), {
      target: { value: '15:00' },
    })
    await user.click(
      screen.getByRole('button', { name: 'Сохранить Исключение' }),
    )

    await waitFor(() => {
      expect(ownerAvailabilityPutAvailabilityException).toHaveBeenCalledWith({
        path: { date: '2026-10-21' },
        body: {
          mode: 'custom',
          intervals: [{ start: '11:00', end: '15:00' }],
        },
      })
    })

    await user.click(screen.getByRole('button', { name: 'Удалить' }))
    expect(ownerAvailabilityDeleteAvailabilityException).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Удалить' }))

    await waitFor(() => {
      expect(ownerAvailabilityDeleteAvailabilityException).toHaveBeenCalledWith(
        {
          path: { date: '2026-10-20' },
        },
      )
    })
    expect(confirm).toHaveBeenCalledTimes(2)
  })
})
