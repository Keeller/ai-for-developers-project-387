import {
  Alert,
  Badge,
  Button,
  Card,
  Container,
  Group,
  Loader,
  NativeSelect,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core'
import { useEffect, useState, type SyntheticEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'

import {
  ownerEventTypesCreateEventType,
  ownerEventTypesDeleteEventType,
  ownerEventTypesGetEventType,
  ownerEventTypesListEventTypes,
  ownerEventTypesUpdateEventType,
  type ApiError,
  type DurationMinutes,
  type EventType,
} from '../api/client'
import { ListLoadStatus } from '../list-load-status'
import { useLoadableList } from '../use-loadable-list'

function ManagementShell({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="page-shell">
      <Container size="md" py="xl" w="100%">
        <Stack gap="lg">
          <Alert color="orange" title="Учебное демо без авторизации">
            Не вводите чувствительные данные: раздел управления открыт и не
            предназначен для production-использования.
          </Alert>
          {children}
        </Stack>
      </Container>
    </main>
  )
}

function EventTypeCard({
  eventType,
  onChanged,
}: Readonly<{ eventType: EventType; onChanged: () => Promise<void> }>) {
  const [message, setMessage] = useState<string | null>(null)

  async function togglePublication() {
    const result = await ownerEventTypesUpdateEventType({
      path: { publicId: eventType.publicId },
      body: {
        publicationState:
          eventType.publicationState === 'published' ? 'hidden' : 'published',
      },
    })

    if (result.data === undefined) {
      setMessage(
        (result.error as ApiError | undefined)?.message ??
          'Не удалось изменить Тип события.',
      )
      return
    }

    await onChanged()
  }

  async function remove() {
    if (
      !window.confirm(`Удалить Тип события «${eventType.name}» безвозвратно?`)
    ) {
      return
    }

    const result = await ownerEventTypesDeleteEventType({
      path: { publicId: eventType.publicId },
    })

    if (result.error !== undefined) {
      const error = result.error
      setMessage(
        error.code === 'event_type_has_bookings'
          ? `${error.message} Используйте действие «Скрыть».`
          : error.message,
      )
      return
    }

    await onChanged()
  }

  return (
    <Card component="article" padding="lg" radius="lg" withBorder>
      <Stack gap="xs">
        <Group justify="space-between">
          <Title order={2}>{eventType.name}</Title>
          <Badge
            color={
              eventType.publicationState === 'published' ? 'green' : 'gray'
            }
          >
            {eventType.publicationState === 'published'
              ? 'Опубликован'
              : 'Скрыт'}
          </Badge>
        </Group>
        <Text c="dimmed">/{eventType.publicId}</Text>
        {eventType.description === undefined ? null : (
          <Text>{eventType.description}</Text>
        )}
        <Text>{eventType.durationMinutes} минут</Text>
        {message === null ? null : <Alert color="red">{message}</Alert>}
        <Group>
          <Button
            component={Link}
            to={`/manage/event-types/${eventType.publicId}/edit`}
            variant="light"
          >
            Изменить
          </Button>
          <Button onClick={() => void togglePublication()} variant="light">
            {eventType.publicationState === 'published'
              ? 'Скрыть'
              : 'Опубликовать'}
          </Button>
          <Button color="red" onClick={() => void remove()} variant="subtle">
            Удалить
          </Button>
        </Group>
      </Stack>
    </Card>
  )
}

export function ManageEventTypesPage() {
  const { error, items, reload } = useLoadableList<EventType>(
    ownerEventTypesListEventTypes,
  )

  const isEmpty = items?.length === 0
  const visibleItems = items ?? []

  return (
    <ManagementShell>
      <Group justify="space-between">
        <Title order={1}>Типы событий</Title>
        {items !== null && items.length > 0 ? (
          <Button component={Link} to="/manage/event-types/new">
            Создать Тип события
          </Button>
        ) : null}
      </Group>

      <ListLoadStatus
        error={error}
        loading={items === null && !error}
        onRetry={reload}
        title="Не удалось загрузить Типы событий"
      />
      {isEmpty ? (
        <Card padding="xl" radius="lg" withBorder>
          <Stack align="flex-start">
            <Title order={2}>Типов событий пока нет</Title>
            <Text c="dimmed">
              Создайте первый вариант разговора, чтобы Гости могли его выбрать.
            </Text>
            <Button component={Link} to="/manage/event-types/new">
              Создать Тип события
            </Button>
          </Stack>
        </Card>
      ) : null}
      {visibleItems.map((eventType) => (
        <EventTypeCard
          eventType={eventType}
          key={eventType.publicId}
          onChanged={reload}
        />
      ))}
    </ManagementShell>
  )
}

const durationOptions = Array.from({ length: 32 }, (_, index) => {
  const value = String((index + 1) * 15)
  return { label: `${value} минут`, value }
})

function useEventTypeForm() {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [durationMinutes, setDurationMinutes] = useState<DurationMinutes>(30)
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<string, string[]>>
  >({})
  const [message, setMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  return {
    description,
    durationMinutes,
    fieldErrors,
    message,
    name,
    setDescription,
    setDurationMinutes,
    setFieldErrors,
    setMessage,
    setName,
    setSubmitting,
    submitting,
  }
}

export function NewEventTypePage() {
  const navigate = useNavigate()
  const [publicId, setPublicId] = useState('')
  const {
    description,
    durationMinutes,
    fieldErrors,
    message,
    name,
    setDescription,
    setDurationMinutes,
    setFieldErrors,
    setMessage,
    setName,
    setSubmitting,
    submitting,
  } = useEventTypeForm()

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setFieldErrors({})
    setMessage(null)

    const result = await ownerEventTypesCreateEventType({
      body: {
        publicId,
        name,
        ...(description.trim() === '' ? {} : { description }),
        durationMinutes,
      },
    })

    setSubmitting(false)

    if (result.data !== undefined) {
      await navigate('/manage/event-types')
      return
    }

    const apiError = result.error as ApiError | undefined
    setFieldErrors(apiError?.fieldErrors ?? {})
    setMessage(apiError?.message ?? 'Не удалось создать Тип события.')
  }

  return (
    <ManagementShell>
      <Title order={1}>Новый Тип события</Title>
      {message === null ? null : <Alert color="red">{message}</Alert>}
      <form onSubmit={(event) => void submit(event)}>
        <Stack>
          <TextInput
            error={fieldErrors.publicId?.[0]}
            label="Публичный ID"
            onChange={(event) => {
              setPublicId(event.currentTarget.value)
            }}
            required
            value={publicId}
          />
          <TextInput
            error={fieldErrors.name?.[0]}
            label="Название"
            onChange={(event) => {
              setName(event.currentTarget.value)
            }}
            required
            value={name}
          />
          <Textarea
            error={fieldErrors.description?.[0]}
            label="Описание"
            maxLength={500}
            onChange={(event) => {
              setDescription(event.currentTarget.value)
            }}
            value={description}
          />
          <NativeSelect
            data={durationOptions}
            error={fieldErrors.durationMinutes?.[0]}
            label="Длительность"
            onChange={(event) => {
              setDurationMinutes(
                Number(event.currentTarget.value) as DurationMinutes,
              )
            }}
            value={String(durationMinutes)}
          />
          <Group>
            <Button disabled={submitting} type="submit">
              {submitting ? 'Создание…' : 'Создать'}
            </Button>
            <Button component={Link} to="/manage/event-types" variant="subtle">
              Отмена
            </Button>
          </Group>
        </Stack>
      </form>
    </ManagementShell>
  )
}

export function EditEventTypePage() {
  const { publicId = '' } = useParams()
  const navigate = useNavigate()
  const [eventType, setEventType] = useState<EventType | null>(null)
  const form = useEventTypeForm()
  const { setDescription, setDurationMinutes, setMessage, setName } = form

  useEffect(() => {
    void ownerEventTypesGetEventType({ path: { publicId } }).then((result) => {
      if (result.data === undefined) {
        setMessage(
          (result.error as ApiError | undefined)?.message ??
            'Тип события не найден.',
        )
        return
      }

      setEventType(result.data)
      setName(result.data.name)
      setDescription(result.data.description ?? '')
      setDurationMinutes(result.data.durationMinutes)
    })
  }, [publicId, setDescription, setDurationMinutes, setMessage, setName])

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    form.setSubmitting(true)
    form.setFieldErrors({})
    form.setMessage(null)
    const result = await ownerEventTypesUpdateEventType({
      path: { publicId },
      body: {
        name: form.name,
        description: form.description,
        durationMinutes: form.durationMinutes,
      },
    })
    form.setSubmitting(false)

    if (result.data !== undefined) {
      await navigate('/manage/event-types')
      return
    }

    const error = result.error as ApiError | undefined
    form.setFieldErrors(error?.fieldErrors ?? {})
    form.setMessage(error?.message ?? 'Не удалось сохранить Тип события.')
  }

  return (
    <ManagementShell>
      <Title order={1}>Изменить Тип события</Title>
      {form.message === null ? null : <Alert color="red">{form.message}</Alert>}
      {eventType === null ? (
        <Loader aria-label="Загрузка" />
      ) : (
        <form onSubmit={(event) => void submit(event)}>
          <Stack>
            <TextInput
              disabled
              label="Публичный ID"
              value={eventType.publicId}
            />
            <TextInput
              error={form.fieldErrors.name?.[0]}
              label="Название"
              onChange={(event) => {
                form.setName(event.currentTarget.value)
              }}
              required
              value={form.name}
            />
            <Textarea
              error={form.fieldErrors.description?.[0]}
              label="Описание"
              maxLength={500}
              onChange={(event) => {
                form.setDescription(event.currentTarget.value)
              }}
              value={form.description}
            />
            <NativeSelect
              data={durationOptions}
              label="Длительность"
              onChange={(event) => {
                form.setDurationMinutes(
                  Number(event.currentTarget.value) as DurationMinutes,
                )
              }}
              value={String(form.durationMinutes)}
            />
            <Group>
              <Button disabled={form.submitting} type="submit">
                Сохранить
              </Button>
              <Button
                component={Link}
                to="/manage/event-types"
                variant="subtle"
              >
                Отмена
              </Button>
            </Group>
          </Stack>
        </form>
      )}
    </ManagementShell>
  )
}
