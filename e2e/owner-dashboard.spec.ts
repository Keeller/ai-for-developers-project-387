import { expect, test } from './fixtures'

test('TC-E2E-12: Владелец открывает кабинет и переходит во все разделы', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'Кабинет владельца' }).click()

  await expect(
    page.getByRole('heading', {
      level: 1,
      name: 'Кабинет Владельца календаря',
    }),
  ).toBeVisible()

  const sections = [
    {
      heading: 'Типы событий',
      link: 'Управлять Типами событий',
      path: '/manage/event-types',
    },
    {
      heading: 'Доступность',
      link: 'Настроить Доступность',
      path: '/manage/availability',
    },
    {
      heading: 'Предстоящие Бронирования',
      link: 'Открыть Бронирования',
      path: '/manage/bookings',
    },
  ] as const

  for (const section of sections) {
    await page.getByRole('link', { name: section.link }).click()
    await expect(page).toHaveURL(new RegExp(`${section.path}$`))
    await expect(
      page.getByRole('heading', { level: 1, name: section.heading }),
    ).toBeVisible()
    await page.goto('/manage')
  }
})
