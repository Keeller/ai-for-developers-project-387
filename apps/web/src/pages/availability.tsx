import {
  Alert,
  Button,
  Card,
  Checkbox,
  Container,
  Group,
  Loader,
  NativeSelect,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useCallback, useEffect, useState, type SyntheticEvent } from 'react'

import {
  ownerAvailabilityDeleteAvailabilityException,
  ownerAvailabilityGetAvailability,
  ownerAvailabilityListAvailabilityExceptions,
  ownerAvailabilityPutAvailabilityException,
  ownerAvailabilityReplaceAvailability,
  type ApiError,
  type AvailabilityException,
  type AvailabilityExceptionMode,
  type WeeklyAvailabilityDay,
} from '../api/client'

const weekdayNames: Record<WeeklyAvailabilityDay['weekday'], string> = {
  monday: 'Понедельник',
  tuesday: 'Вторник',
  wednesday: 'Среда',
  thursday: 'Четверг',
  friday: 'Пятница',
  saturday: 'Суббота',
  sunday: 'Воскресенье',
}

const timeZones = Intl.supportedValuesOf('timeZone')

export function ManageAvailabilityPage() {
  const [timeZone, setTimeZone] = useState('Europe/Moscow')
  const [savedTimeZone, setSavedTimeZone] = useState('Europe/Moscow')
  const [week, setWeek] = useState<WeeklyAvailabilityDay[] | null>(null)
  const [exceptions, setExceptions] = useState<AvailabilityException[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const [date, setDate] = useState('')
  const [mode, setMode] = useState<AvailabilityExceptionMode>('closed')
  const [exceptionStart, setExceptionStart] = useState('09:00')
  const [exceptionEnd, setExceptionEnd] = useState('17:00')

  const load = useCallback(async (isActive: () => boolean = () => true) => {
    setMessage(null)
    const [availabilityResult, exceptionResult] = await Promise.all([
      ownerAvailabilityGetAvailability(),
      ownerAvailabilityListAvailabilityExceptions(),
    ])

    if (!isActive()) return

    if (availabilityResult.data === undefined) {
      setMessage('Не удалось загрузить Доступность.')
      return
    }

    setTimeZone(availabilityResult.data.timeZone)
    setSavedTimeZone(availabilityResult.data.timeZone)
    setWeek(availabilityResult.data.week)
    setExceptions(exceptionResult.data?.items ?? [])
  }, [])

  useEffect(() => {
    let active = true
    void Promise.resolve().then(() => load(() => active))

    return () => {
      active = false
    }
  }, [load])

  function updateDay(
    weekday: WeeklyAvailabilityDay['weekday'],
    update: (day: WeeklyAvailabilityDay) => WeeklyAvailabilityDay,
  ) {
    setWeek(
      (current) =>
        current?.map((day) => (day.weekday === weekday ? update(day) : day)) ??
        null,
    )
  }

  function setDayEnabled(
    weekday: WeeklyAvailabilityDay['weekday'],
    enabled: boolean,
  ) {
    updateDay(weekday, (current) => ({
      ...current,
      enabled,
      intervals: enabled ? current.intervals : [],
    }))
  }

  function setIntervalValue(
    weekday: WeeklyAvailabilityDay['weekday'],
    index: number,
    key: 'end' | 'start',
    value: string,
  ) {
    updateDay(weekday, (current) => ({
      ...current,
      intervals: current.intervals.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item,
      ),
    }))
  }

  function removeInterval(
    weekday: WeeklyAvailabilityDay['weekday'],
    index: number,
  ) {
    updateDay(weekday, (current) => ({
      ...current,
      intervals: current.intervals.filter(
        (_, itemIndex) => itemIndex !== index,
      ),
    }))
  }

  function addInterval(weekday: WeeklyAvailabilityDay['weekday']) {
    updateDay(weekday, (current) => ({
      ...current,
      intervals: [...current.intervals, { start: '09:00', end: '17:00' }],
    }))
  }

  async function saveAvailability(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    if (week === null) return

    if (
      timeZone !== savedTimeZone &&
      !window.confirm(
        'Смена Часового пояса календаря сдвинет будущие свободные Слоты. Продолжить?',
      )
    ) {
      return
    }

    const result = await ownerAvailabilityReplaceAvailability({
      body: { timeZone, week },
    })

    if (result.data === undefined) {
      setMessage(
        (result.error as ApiError | undefined)?.message ??
          'Не удалось сохранить Доступность.',
      )
      return
    }

    setSavedTimeZone(result.data.timeZone)
    setWeek(result.data.week)
    setMessage('Доступность сохранена.')
  }

  async function saveException(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = await ownerAvailabilityPutAvailabilityException({
      path: { date },
      body: {
        mode,
        intervals:
          mode === 'closed'
            ? []
            : [{ start: exceptionStart, end: exceptionEnd }],
      },
    })

    if (result.data === undefined) {
      setMessage(
        (result.error as ApiError | undefined)?.message ??
          'Не удалось сохранить Исключение доступности.',
      )
      return
    }

    setMessage('Исключение доступности сохранено.')
    await load()
  }

  async function removeException(exceptionDate: string) {
    if (!window.confirm(`Удалить Исключение доступности на ${exceptionDate}?`))
      return

    await ownerAvailabilityDeleteAvailabilityException({
      path: { date: exceptionDate },
    })
    await load()
  }

  return (
    <main className="page-shell">
      <Container size="lg" py="xl" w="100%">
        <Stack>
          <Alert color="orange" title="Учебное демо без авторизации">
            Настройки доступны без входа. Не используйте сервис для
            чувствительных данных.
          </Alert>
          <Title order={1}>Доступность</Title>
          {message === null ? null : <Alert>{message}</Alert>}
          {week === null ? (
            <Loader aria-label="Загрузка" />
          ) : (
            <form onSubmit={(event) => void saveAvailability(event)}>
              <Stack>
                <NativeSelect
                  data={timeZones}
                  label="Часовой пояс календаря"
                  onChange={(event) => {
                    setTimeZone(event.currentTarget.value)
                  }}
                  value={timeZone}
                />
                {week.map((day) => (
                  <Card
                    component="fieldset"
                    key={day.weekday}
                    padding="md"
                    withBorder
                  >
                    <Stack>
                      <Checkbox
                        checked={day.enabled}
                        label={weekdayNames[day.weekday]}
                        onChange={(event) => {
                          setDayEnabled(
                            day.weekday,
                            event.currentTarget.checked,
                          )
                        }}
                      />
                      {day.intervals.map((interval, index) => (
                        <Group key={`${day.weekday}-${String(index)}`}>
                          <TextInput
                            label={`${weekdayNames[day.weekday]}: начало ${String(index + 1)}`}
                            onChange={(event) => {
                              setIntervalValue(
                                day.weekday,
                                index,
                                'start',
                                event.currentTarget.value,
                              )
                            }}
                            step={900}
                            type="time"
                            value={interval.start}
                          />
                          <TextInput
                            label={`${weekdayNames[day.weekday]}: окончание ${String(index + 1)}`}
                            onChange={(event) => {
                              setIntervalValue(
                                day.weekday,
                                index,
                                'end',
                                event.currentTarget.value,
                              )
                            }}
                            step={900}
                            type="time"
                            value={interval.end}
                          />
                          <Button
                            onClick={() => {
                              removeInterval(day.weekday, index)
                            }}
                            type="button"
                            variant="subtle"
                          >
                            Удалить интервал
                          </Button>
                        </Group>
                      ))}
                      {day.enabled ? (
                        <Button
                          onClick={() => {
                            addInterval(day.weekday)
                          }}
                          type="button"
                          variant="light"
                        >
                          Добавить интервал
                        </Button>
                      ) : null}
                    </Stack>
                  </Card>
                ))}
                <Button type="submit">Сохранить Доступность</Button>
              </Stack>
            </form>
          )}

          <Title order={2}>Исключения доступности</Title>
          {exceptions.length === 0 ? <Text>Исключений пока нет.</Text> : null}
          {exceptions.map((item) => (
            <Card key={item.date} padding="md" withBorder>
              <Group justify="space-between">
                <Text>
                  {item.date}:{' '}
                  {item.mode === 'closed' ? 'закрыто' : 'особые часы'}
                </Text>
                <Button
                  color="red"
                  onClick={() => void removeException(item.date)}
                  variant="subtle"
                >
                  Удалить
                </Button>
              </Group>
            </Card>
          ))}
          <form onSubmit={(event) => void saveException(event)}>
            <Stack>
              <TextInput
                label="Дата исключения"
                onChange={(event) => {
                  setDate(event.currentTarget.value)
                }}
                required
                type="date"
                value={date}
              />
              <NativeSelect
                data={[
                  { label: 'Закрыть весь день', value: 'closed' },
                  { label: 'Заменить интервалами', value: 'custom' },
                ]}
                label="Режим исключения"
                onChange={(event) => {
                  setMode(
                    event.currentTarget.value as AvailabilityExceptionMode,
                  )
                }}
                value={mode}
              />
              {mode === 'custom' ? (
                <Group>
                  <TextInput
                    label="Начало исключения"
                    onChange={(event) => {
                      setExceptionStart(event.currentTarget.value)
                    }}
                    step={900}
                    type="time"
                    value={exceptionStart}
                  />
                  <TextInput
                    label="Окончание исключения"
                    onChange={(event) => {
                      setExceptionEnd(event.currentTarget.value)
                    }}
                    step={900}
                    type="time"
                    value={exceptionEnd}
                  />
                </Group>
              ) : null}
              <Button type="submit">Сохранить Исключение</Button>
            </Stack>
          </form>
        </Stack>
      </Container>
    </main>
  )
}
