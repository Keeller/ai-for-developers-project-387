import {
  Alert,
  Button,
  Card,
  Container,
  Loader,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { useEffect, useState } from 'react'

import {
  ownerBookingsListFutureBookings,
  type FutureBookingList,
} from '../api/client'

export function ManageBookingsPage() {
  const [data, setData] = useState<FutureBookingList | null>(null)
  const [error, setError] = useState(false)

  async function load() {
    setData(null)
    setError(false)
    const result = await ownerBookingsListFutureBookings()

    if (result.data === undefined) {
      setError(true)
      return
    }

    setData(result.data)
  }

  useEffect(() => {
    let active = true
    void ownerBookingsListFutureBookings().then((result) => {
      if (!active) return

      if (result.data === undefined) {
        setError(true)
        return
      }

      setData(result.data)
    })

    return () => {
      active = false
    }
  }, [])

  return (
    <main className="page-shell">
      <Container size="md" py="xl" w="100%">
        <Stack>
          <Alert color="orange" title="Учебное демо без авторизации">
            Не используйте этот открытый раздел для чувствительных данных.
          </Alert>
          <Title order={1}>Предстоящие Бронирования</Title>
          {data === null && !error ? <Loader aria-label="Загрузка" /> : null}
          {error ? (
            <Alert color="red" title="Не удалось загрузить Бронирования">
              <Button mt="sm" onClick={() => void load()} variant="light">
                Повторить
              </Button>
            </Alert>
          ) : null}
          {data?.items.length === 0 ? (
            <Alert title="Предстоящих Бронирований нет" />
          ) : null}
          {data?.items.map((booking) => {
            const formatter = new Intl.DateTimeFormat('ru-RU', {
              dateStyle: 'medium',
              timeStyle: 'short',
              timeZone: data.calendarTimeZone,
            })
            return (
              <Card
                component="article"
                key={booking.id}
                padding="lg"
                withBorder
              >
                <Stack gap="xs">
                  <Title order={2}>{booking.eventType.name}</Title>
                  <Text>
                    {formatter.format(new Date(booking.startAt))} —{' '}
                    {formatter.format(new Date(booking.endAt))}
                  </Text>
                  <Text>{booking.eventType.durationMinutes} минут</Text>
                  <Text>{booking.guest.name}</Text>
                  <Text>{booking.guest.email}</Text>
                </Stack>
              </Card>
            )
          })}
        </Stack>
      </Container>
    </main>
  )
}
