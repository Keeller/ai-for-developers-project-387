// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'

import { MantineProvider } from '@mantine/core'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import App from './App'
import {
  ownerEventTypesCreateEventType,
  ownerEventTypesGetEventType,
  ownerEventTypesListEventTypes,
  ownerEventTypesUpdateEventType,
} from './api/client'

vi.mock('./api/client', () => ({
  ownerEventTypesCreateEventType: vi.fn(),
  ownerEventTypesGetEventType: vi.fn(),
  ownerEventTypesListEventTypes: vi.fn(),
  ownerEventTypesUpdateEventType: vi.fn(),
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

describe('управление Типами событий', () => {
  it('показывает пустое состояние и создаёт опубликованный Тип события', async () => {
    const user = userEvent.setup()
    vi.mocked(ownerEventTypesListEventTypes)
      .mockResolvedValueOnce({ data: { items: [] }, error: undefined })
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              publicId: 'discovery-call',
              name: 'Знакомство',
              durationMinutes: 30,
              publicationState: 'published',
              createdAt: '2026-10-12T10:00:00.000Z',
              updatedAt: '2026-10-12T10:00:00.000Z',
            },
          ],
        },
        error: undefined,
      })
    vi.mocked(ownerEventTypesCreateEventType).mockResolvedValue({
      data: {
        publicId: 'discovery-call',
        name: 'Знакомство',
        durationMinutes: 30,
        publicationState: 'published',
        createdAt: '2026-10-12T10:00:00.000Z',
        updatedAt: '2026-10-12T10:00:00.000Z',
      },
      error: undefined,
    })

    renderApp('/manage/event-types')

    expect(
      await screen.findByText('Типов событий пока нет'),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Создать Тип события' }))

    await user.type(screen.getByLabelText(/Публичный ID/), 'discovery-call')
    await user.type(screen.getByLabelText(/Название/), 'Знакомство')
    await user.selectOptions(screen.getByLabelText('Длительность'), '30')
    await user.click(screen.getByRole('button', { name: 'Создать' }))

    expect(
      await screen.findByRole('heading', { name: 'Знакомство' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Опубликован')).toBeInTheDocument()
  })

  it('загружает Тип события, сохраняет изменения и возвращает Владельца к списку', async () => {
    const user = userEvent.setup()
    vi.mocked(ownerEventTypesGetEventType).mockResolvedValue({
      data: {
        publicId: 'discovery-call',
        name: 'Знакомство',
        description: 'Короткий разговор',
        durationMinutes: 30,
        publicationState: 'published',
        createdAt: '2026-10-12T10:00:00.000Z',
        updatedAt: '2026-10-12T10:00:00.000Z',
      },
      error: undefined,
    })
    vi.mocked(ownerEventTypesUpdateEventType).mockResolvedValue({
      data: {
        publicId: 'discovery-call',
        name: 'Подробное знакомство',
        description: 'Обсудим задачу подробнее',
        durationMinutes: 45,
        publicationState: 'published',
        createdAt: '2026-10-12T10:00:00.000Z',
        updatedAt: '2026-10-12T10:05:00.000Z',
      },
      error: undefined,
    })
    vi.mocked(ownerEventTypesListEventTypes).mockResolvedValue({
      data: {
        items: [
          {
            publicId: 'discovery-call',
            name: 'Подробное знакомство',
            description: 'Обсудим задачу подробнее',
            durationMinutes: 45,
            publicationState: 'published',
            createdAt: '2026-10-12T10:00:00.000Z',
            updatedAt: '2026-10-12T10:05:00.000Z',
          },
        ],
      },
      error: undefined,
    })

    renderApp('/manage/event-types/discovery-call/edit')

    const name = await screen.findByLabelText(/Название/)
    await user.clear(name)
    await user.type(name, 'Подробное знакомство')
    const description = screen.getByLabelText('Описание')
    await user.clear(description)
    await user.type(description, 'Обсудим задачу подробнее')
    await user.selectOptions(screen.getByLabelText('Длительность'), '45')
    await user.click(screen.getByRole('button', { name: 'Сохранить' }))

    expect(ownerEventTypesUpdateEventType).toHaveBeenCalledWith({
      path: { publicId: 'discovery-call' },
      body: {
        name: 'Подробное знакомство',
        description: 'Обсудим задачу подробнее',
        durationMinutes: 45,
      },
    })
    expect(
      await screen.findByRole('heading', { name: 'Подробное знакомство' }),
    ).toBeInTheDocument()
  })
})
