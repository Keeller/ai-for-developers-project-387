// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import { MantineProvider } from '@mantine/core'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'

import App from './App'

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

afterEach(cleanup)

function renderApp(path: string) {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={[path]}>
        <App />
      </MemoryRouter>
    </MantineProvider>,
  )
}

describe('public routes', () => {
  it('Гость может начать Запись на звонок с главной', () => {
    renderApp('/')

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Выберите удобное время для звонка',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'Выберите подходящий формат разговора и свободный Слот без регистрации и долгой переписки',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Разная длительность')).toBeInTheDocument()
    expect(screen.getByText('Без регистрации')).toBeInTheDocument()
    expect(screen.getByText('Без переписки')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Записаться' })).toHaveAttribute(
      'href',
      '/book',
    )
  })

  it('Гость может открыть раздел записи и вернуться на главную', async () => {
    const user = userEvent.setup()
    renderApp('/')

    await user.click(screen.getByRole('link', { name: 'Записаться' }))

    expect(
      screen.getByRole('heading', { level: 1, name: 'Выберите Тип события' }),
    ).toBeInTheDocument()
  })

  it('Гость может вернуться с неизвестного адреса на главную', () => {
    renderApp('/missing-page')

    expect(
      screen.getByRole('heading', { level: 1, name: 'Страница не найдена' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'На главную' })).toHaveAttribute(
      'href',
      '/',
    )
  })
})

describe('owner routes', () => {
  it('Владелец календаря видит в кабинете переходы ко всем разделам управления', () => {
    renderApp('/manage')

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Кабинет Владельца календаря',
      }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Управлять Типами событий' }),
    ).toHaveAttribute('href', '/manage/event-types')
    expect(
      screen.getByRole('link', { name: 'Настроить Доступность' }),
    ).toHaveAttribute('href', '/manage/availability')
    expect(
      screen.getByRole('link', { name: 'Открыть Бронирования' }),
    ).toHaveAttribute('href', '/manage/bookings')
  })
})
