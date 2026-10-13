import { expect, test } from './fixtures'

test('TC-E2E-05: Владелец сохраняет недельную Доступность', async ({
  page,
}) => {
  await page.goto('/manage/availability')
  await expect(page.getByRole('heading', { name: 'Доступность' })).toBeVisible()
  await page.getByRole('checkbox', { name: 'Понедельник' }).check()
  await page.getByRole('button', { name: 'Добавить интервал' }).click()
  await page.getByLabel('Понедельник: начало 1').fill('10:15')
  await page.getByLabel('Понедельник: окончание 1').fill('13:45')
  await page.getByRole('button', { name: 'Сохранить Доступность' }).click()

  await expect(page.getByText('Доступность сохранена.')).toBeVisible()
  await page.reload()
  await expect(page.getByLabel('Часовой пояс календаря')).toHaveValue(
    'Europe/Moscow',
  )
  await expect(
    page.getByRole('checkbox', { name: 'Понедельник' }),
  ).toBeChecked()
  await expect(page.getByLabel('Понедельник: начало 1')).toHaveValue('10:15')
  await expect(page.getByLabel('Понедельник: окончание 1')).toHaveValue('13:45')
  await expect(
    page.getByRole('checkbox', { name: 'Вторник' }),
  ).not.toBeChecked()
})

test('TC-E2E-06: Владелец создаёт и удаляет Исключение доступности', async ({
  page,
}) => {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)

  await page.goto('/manage/availability')
  await page.getByLabel('Дата исключения').fill(tomorrow)
  await page.getByLabel('Режим исключения').selectOption('custom')
  await page.getByLabel('Начало исключения').fill('11:00')
  await page.getByLabel('Окончание исключения').fill('14:30')
  await page.getByRole('button', { name: 'Сохранить Исключение' }).click()

  const exception = page.getByText(`${tomorrow}: особые часы`)
  await expect(exception).toBeVisible()

  page.once('dialog', (dialog) => dialog.dismiss())
  await page.getByRole('button', { name: 'Удалить' }).click()
  await expect(exception).toBeVisible()

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Удалить' }).click()
  await expect(exception).toHaveCount(0)
  await expect(page.getByText('Исключений пока нет.')).toBeVisible()
})
