import {
  Alert,
  Button,
  Card,
  Container,
  Group,
  Loader,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type SyntheticEvent,
} from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'

import {
  guestBookingsCreateBooking,
  guestEventTypesGetPublicEventType,
  guestEventTypesListAvailableSlots,
  guestEventTypesListPublicEventTypes,
  type ApiError,
  type AvailableSlot,
  type Booking,
  type PublicEventType,
  type SlotWindow,
} from '../api/client'
import { ListLoadStatus } from '../list-load-status'
import { useLoadableList } from '../use-loadable-list'

function PublicShell({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="page-shell">
      <Container size="md" py="xl" w="100%">
        <Stack gap="lg">{children}</Stack>
      </Container>
    </main>
  )
}

export function PublicEventTypesPage() {
  const { error, items, reload } = useLoadableList<PublicEventType>(
    guestEventTypesListPublicEventTypes,
  )

  return (
    <PublicShell>
      <Title order={1}>Выберите Тип события</Title>
      <ListLoadStatus
        error={error}
        loading={items === null && !error}
        onRetry={reload}
        title="Не удалось загрузить Типы событий"
      />
      {items?.length === 0 ? (
        <Alert title="Нет доступных Типов событий">
          Владелец календаря пока ничего не опубликовал.
        </Alert>
      ) : null}
      {items?.map((item) => (
        <Card component="article" key={item.publicId} padding="lg" withBorder>
          <Stack>
            <Title order={2}>{item.name}</Title>
            {item.description === undefined ? null : (
              <Text>{item.description}</Text>
            )}
            <Text>{item.durationMinutes} минут</Text>
            <Button component={Link} to={`/book/${item.publicId}`}>
              Выбрать {item.name}
            </Button>
          </Stack>
        </Card>
      ))}
    </PublicShell>
  )
}

function detectedTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

function groupSlotsByGuestDate(days: SlotWindow['days']) {
  const byDate = new Map<string, AvailableSlot[]>()
  const orderedSlots = days
    .flatMap((day) => day.slots)
    .toSorted((left, right) => left.startAt.localeCompare(right.startAt))

  for (const slot of orderedSlots) {
    const daySlots = byDate.get(slot.guestLocalDate) ?? []
    daySlots.push(slot)
    byDate.set(slot.guestLocalDate, daySlots)
  }

  return [...byDate].map(([guestLocalDate, slots]) => ({
    guestLocalDate,
    slots,
  }))
}

export function BookingPage() {
  const { publicId = '' } = useParams()
  const navigate = useNavigate()
  const [eventType, setEventType] = useState<PublicEventType | null>(null)
  const [slots, setSlots] = useState<SlotWindow | null>(null)
  const [timeZone, setTimeZone] = useState(detectedTimeZone)
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null)
  const [guestName, setGuestName] = useState('')
  const [guestEmail, setGuestEmail] = useState('')
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<string, string[]>>
  >({})
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const idempotencyKey = useRef(crypto.randomUUID())
  const initialTimeZone = useRef(timeZone)

  const loadSlots = useCallback(
    async (nextTimeZone: string, isActive: () => boolean = () => true) => {
      setLoading(true)
      setMessage(null)
      const [eventResult, slotResult] = await Promise.all([
        guestEventTypesGetPublicEventType({ path: { publicId } }),
        guestEventTypesListAvailableSlots({
          path: { publicId },
          query: { guestTimeZone: nextTimeZone },
        }),
      ])

      if (!isActive()) return

      setLoading(false)

      if (eventResult.data === undefined || slotResult.data === undefined) {
        const error = eventResult.error ?? slotResult.error
        setMessage(error?.message ?? 'Не удалось загрузить свободные Слоты.')
        return
      }

      setEventType(eventResult.data)
      setSlots(slotResult.data)
    },
    [publicId],
  )

  useEffect(() => {
    let active = true
    void loadSlots(initialTimeZone.current, () => active)

    return () => {
      active = false
    }
  }, [loadSlots])

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()

    if (selectedSlot === null) return

    setSubmitting(true)
    setMessage(null)
    setFieldErrors({})
    const result = await guestBookingsCreateBooking({
      headers: { 'Idempotency-Key': idempotencyKey.current },
      body: {
        eventTypePublicId: publicId,
        startAt: selectedSlot.startAt,
        guestName,
        guestEmail,
        guestTimeZone: timeZone,
      },
    })
    setSubmitting(false)

    if (result.data !== undefined) {
      await navigate(`/book/${publicId}/success`, {
        state: { booking: result.data },
      })
      return
    }

    const error = result.error as ApiError | undefined
    setFieldErrors(error?.fieldErrors ?? {})

    if (error?.code === 'slot_unavailable') {
      setSelectedSlot(null)
      idempotencyKey.current = crypto.randomUUID()
      await loadSlots(timeZone)
      setMessage(error.message)
      return
    }

    setMessage(error?.message ?? 'Не удалось создать Бронирование.')
  }

  return (
    <PublicShell>
      {loading ? <Loader aria-label="Загрузка Слотов" /> : null}
      {message === null ? null : (
        <Alert color="red" title="Не удалось продолжить">
          <Text>{message}</Text>
          <Button
            mt="sm"
            onClick={() => void loadSlots(timeZone)}
            variant="light"
          >
            Повторить
          </Button>
        </Alert>
      )}
      {eventType === null || slots === null ? null : (
        <>
          <Title order={1}>{eventType.name}</Title>
          <Text>{eventType.durationMinutes} минут</Text>
          <TextInput
            label="Часовой пояс гостя"
            onChange={(event) => {
              setTimeZone(event.currentTarget.value)
            }}
            value={timeZone}
          />
          <Button onClick={() => void loadSlots(timeZone)} variant="light">
            Показать время в этой зоне
          </Button>
          {slots.days.length === 0 ? (
            <Alert title="Свободного времени пока нет">
              Проверьте эту страницу позже.
            </Alert>
          ) : null}
          {groupSlotsByGuestDate(slots.days).map((day) => (
            <section key={day.guestLocalDate}>
              <Title order={2}>{day.guestLocalDate}</Title>
              <Group mt="sm">
                {day.slots.map((slot) => (
                  <Button
                    key={slot.startAt}
                    onClick={() => {
                      setSelectedSlot(slot)
                      idempotencyKey.current = crypto.randomUUID()
                    }}
                    variant={
                      selectedSlot?.startAt === slot.startAt
                        ? 'filled'
                        : 'light'
                    }
                  >
                    {slot.guestLocalStart} {slot.guestUtcOffset}
                  </Button>
                ))}
              </Group>
            </section>
          ))}
          {selectedSlot === null ? null : (
            <Card padding="lg" withBorder>
              <form onSubmit={(event) => void submit(event)}>
                <Stack>
                  <Title order={2}>Проверьте детали</Title>
                  <Text>
                    {eventType.name}, {selectedSlot.guestLocalDate}{' '}
                    {selectedSlot.guestLocalStart}, {eventType.durationMinutes}{' '}
                    минут, {timeZone}
                  </Text>
                  <Alert color="orange" title="Учебное демо без авторизации">
                    Не вводите чувствительные данные. Конфиденциальность
                    production-сервиса не обеспечивается.
                  </Alert>
                  <TextInput
                    error={fieldErrors.guestName?.[0]}
                    label="Имя"
                    onChange={(event) => {
                      setGuestName(event.currentTarget.value)
                    }}
                    required
                    value={guestName}
                  />
                  <TextInput
                    error={fieldErrors.guestEmail?.[0]}
                    label="Email"
                    onChange={(event) => {
                      setGuestEmail(event.currentTarget.value)
                    }}
                    required
                    type="email"
                    value={guestEmail}
                  />
                  <Button disabled={submitting} type="submit">
                    {submitting ? 'Подтверждение…' : 'Подтвердить'}
                  </Button>
                </Stack>
              </form>
            </Card>
          )}
        </>
      )}
    </PublicShell>
  )
}

export function BookingSuccessPage() {
  const location = useLocation()
  const booking = (location.state as { booking?: Booking } | null)?.booking

  if (booking === undefined) {
    return (
      <PublicShell>
        <Title order={1}>Подтверждение недоступно</Title>
        <Button component={Link} to="/book">
          Выбрать Тип события
        </Button>
      </PublicShell>
    )
  }

  const formatter = new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: booking.guest.timeZone,
  })

  return (
    <PublicShell>
      <Title order={1}>Бронирование подтверждено</Title>
      <Card padding="lg" withBorder>
        <Stack>
          <Text fw={700}>{booking.eventType.name}</Text>
          <Text>{formatter.format(new Date(booking.startAt))}</Text>
          <Text>{booking.eventType.durationMinutes} минут</Text>
          <Text>Часовой пояс: {booking.guest.timeZone}</Text>
        </Stack>
      </Card>
      <Button component={Link} to="/book" variant="light">
        Выбрать другой Тип события
      </Button>
    </PublicShell>
  )
}
