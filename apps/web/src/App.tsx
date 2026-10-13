import {
  Badge,
  Button,
  Container,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { Link, Route, Routes } from 'react-router-dom'

import {
  ManageEventTypesPage,
  NewEventTypePage,
  EditEventTypePage,
} from './pages/event-types'
import {
  BookingPage,
  BookingSuccessPage,
  PublicEventTypesPage,
} from './pages/booking'
import { ManageBookingsPage } from './pages/bookings'
import { ManageAvailabilityPage } from './pages/availability'
import { OwnerDashboardPage } from './pages/owner-dashboard'

const CALL_FACTS = ['Разная длительность', 'Без регистрации', 'Без переписки']

function HomePage() {
  return (
    <main className="page-shell">
      <Container className="hero" size="md">
        <Stack align="center" gap="xl">
          <Stack align="center" gap="md" className="hero-copy">
            <Text className="product-name">Запись на звонок</Text>
            <Badge color="indigo" radius="xl" size="lg" variant="light">
              Простая онлайн-запись
            </Badge>
            <Title className="hero-title" order={1} ta="center">
              Выберите удобное время для звонка
            </Title>
            <Text c="dimmed" className="hero-description" size="xl" ta="center">
              Выберите подходящий формат разговора и свободный Слот без
              регистрации и долгой переписки
            </Text>
          </Stack>

          <Group justify="center">
            <Button
              className="primary-action"
              component={Link}
              radius="xl"
              size="lg"
              to="/book"
            >
              Записаться
            </Button>
            <Button
              component={Link}
              radius="xl"
              size="lg"
              to="/manage"
              variant="subtle"
            >
              Кабинет владельца
            </Button>
          </Group>

          <SimpleGrid
            className="call-facts"
            cols={{ base: 1, xs: 3 }}
            component="ul"
            spacing="md"
          >
            {CALL_FACTS.map((fact) => (
              <Paper component="li" key={fact} p="md" radius="lg" withBorder>
                <Text fw={600} ta="center">
                  {fact}
                </Text>
              </Paper>
            ))}
          </SimpleGrid>
        </Stack>
      </Container>
    </main>
  )
}

type StatusPageProps = Readonly<{
  badge: string
  description: string
  title: string
}>

function StatusPage({ badge, description, title }: StatusPageProps) {
  return (
    <main className="page-shell">
      <Container size="xs" w="100%">
        <Paper className="status-card" p="xl" radius="xl" withBorder>
          <Stack align="center" gap="lg">
            <Text className="product-name">Запись на звонок</Text>
            <Badge color="indigo" radius="xl" variant="light">
              {badge}
            </Badge>
            <Title order={1} ta="center">
              {title}
            </Title>
            <Text c="dimmed" size="lg" ta="center">
              {description}
            </Text>
            <Button
              component={Link}
              radius="xl"
              size="md"
              to="/"
              variant="light"
            >
              На главную
            </Button>
          </Stack>
        </Paper>
      </Container>
    </main>
  )
}

export default function App() {
  return (
    <Routes>
      <Route element={<HomePage />} path="/" />
      <Route element={<PublicEventTypesPage />} path="/book" />
      <Route element={<BookingPage />} path="/book/:publicId" />
      <Route element={<BookingSuccessPage />} path="/book/:publicId/success" />
      <Route element={<OwnerDashboardPage />} path="/manage" />
      <Route element={<ManageEventTypesPage />} path="/manage/event-types" />
      <Route element={<NewEventTypePage />} path="/manage/event-types/new" />
      <Route
        element={<EditEventTypePage />}
        path="/manage/event-types/:publicId/edit"
      />
      <Route element={<ManageBookingsPage />} path="/manage/bookings" />
      <Route element={<ManageAvailabilityPage />} path="/manage/availability" />
      <Route
        element={
          <StatusPage
            badge="404"
            description="Проверьте адрес или вернитесь на главную"
            title="Страница не найдена"
          />
        }
        path="*"
      />
    </Routes>
  )
}
