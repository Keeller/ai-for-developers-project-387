import {
  Alert,
  Badge,
  Button,
  Card,
  Container,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { Link } from 'react-router-dom'

const ownerSections = [
  {
    description:
      'Создавайте варианты разговоров, меняйте длительность и управляйте публикацией.',
    href: '/manage/event-types',
    linkLabel: 'Управлять Типами событий',
    title: 'Типы событий',
  },
  {
    description:
      'Задавайте недельное расписание, Часовой пояс календаря и исключения для отдельных дат.',
    href: '/manage/availability',
    linkLabel: 'Настроить Доступность',
    title: 'Доступность',
  },
  {
    description:
      'Просматривайте предстоящие Бронирования всех Типов событий в одном списке.',
    href: '/manage/bookings',
    linkLabel: 'Открыть Бронирования',
    title: 'Бронирования',
  },
] as const

export function OwnerDashboardPage() {
  return (
    <main className="page-shell">
      <Container size="lg" py="xl" w="100%">
        <Stack gap="xl">
          <Stack gap="sm">
            <Badge color="indigo" radius="xl" size="lg" variant="light">
              Управление календарём
            </Badge>
            <Title order={1}>Кабинет Владельца календаря</Title>
            <Text c="dimmed" maw={680} size="lg">
              Управляйте предложениями для Гостей, временем для записи и
              созданными Бронированиями.
            </Text>
          </Stack>

          <Alert color="orange" title="Учебное демо без авторизации">
            Раздел открыт без входа. Не вводите чувствительные данные.
          </Alert>

          <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
            {ownerSections.map((section) => (
              <Card
                component="section"
                key={section.href}
                padding="xl"
                radius="lg"
                withBorder
              >
                <Stack align="flex-start" h="100%">
                  <Title order={2}>{section.title}</Title>
                  <Text c="dimmed" style={{ flexGrow: 1 }}>
                    {section.description}
                  </Text>
                  <Button component={Link} to={section.href} variant="light">
                    {section.linkLabel}
                  </Button>
                </Stack>
              </Card>
            ))}
          </SimpleGrid>

          <Button component={Link} to="/" variant="subtle">
            На гостевую страницу
          </Button>
        </Stack>
      </Container>
    </main>
  )
}
