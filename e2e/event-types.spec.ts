import { createEventType, expect, test } from './fixtures'

test('TC-E2E-01: Владелец создаёт и изменяет Тип события', async ({ page }) => {
  await page.goto('/manage/event-types')
  await page.getByRole('link', { name: 'Создать Тип события' }).click()
  await page.getByLabel('Публичный ID').fill('discovery-call')
  await page.getByLabel('Название').fill('Знакомство')
  await page.getByLabel('Описание').fill('Короткий вводный разговор')
  await page.getByLabel('Длительность').selectOption('45')
  await page.getByRole('button', { name: 'Создать' }).click()

  let card = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: 'Знакомство' }),
  })
  await expect(card).toContainText('/discovery-call')
  await expect(card).toContainText('Короткий вводный разговор')
  await expect(card).toContainText('45 минут')

  await card.getByRole('link', { name: 'Изменить' }).click()
  await expect(page.getByLabel('Публичный ID')).toBeDisabled()
  await page.getByLabel('Название').fill('Подробное знакомство')
  await page.getByLabel('Описание').fill('Обновлённое описание')
  await page.getByLabel('Длительность').selectOption('60')
  await page.getByRole('button', { name: 'Сохранить' }).click()

  card = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: 'Подробное знакомство' }),
  })
  await expect(card).toContainText('/discovery-call')
  await expect(card).toContainText('Обновлённое описание')
  await expect(card).toContainText('60 минут')
})

test('TC-E2E-02: публикация управляет видимостью Типа события для Гостя', async ({
  page,
  request,
}) => {
  await createEventType(request, {
    publicId: 'public-call',
    name: 'Открытая консультация',
    description: 'Описание для Гостя',
    durationMinutes: 30,
  })

  await page.goto('/manage/event-types')
  const card = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: 'Открытая консультация' }),
  })
  await card.getByRole('button', { name: 'Скрыть' }).click()
  await expect(card).toContainText('Скрыт')

  await page.goto('/book')
  await expect(
    page.getByRole('heading', { name: 'Открытая консультация' }),
  ).toHaveCount(0)

  await page.goto('/manage/event-types')
  await card.getByRole('button', { name: 'Опубликовать' }).click()
  await expect(card).toContainText('Опубликован')
  await page.goto('/book')
  const publicCard = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: 'Открытая консультация' }),
  })
  await expect(publicCard).toContainText('Описание для Гостя')
  await expect(publicCard).toContainText('30 минут')
})

test('TC-E2E-03: повторный публичный ID отклоняется', async ({
  page,
  request,
}) => {
  await createEventType(request, {
    publicId: 'duplicate-call',
    name: 'Первый Тип события',
  })

  await page.goto('/manage/event-types/new')
  await page.getByLabel('Публичный ID').fill('duplicate-call')
  await page.getByLabel('Название').fill('Второй Тип события')
  await page.getByRole('button', { name: 'Создать' }).click()

  await expect(
    page.getByText('Тип события с таким публичным ID уже существует.'),
  ).toBeVisible()
  await expect(page.getByText('Выберите другой публичный ID.')).toBeVisible()
  await expect(page).toHaveURL(/\/manage\/event-types\/new$/)
})

test('TC-E2E-04: Владелец удаляет Тип события только после подтверждения', async ({
  page,
  request,
}) => {
  await createEventType(request, {
    publicId: 'temporary-call',
    name: 'Временный разговор',
  })
  await page.goto('/manage/event-types')
  const card = page.getByRole('article').filter({
    has: page.getByRole('heading', { name: 'Временный разговор' }),
  })

  page.once('dialog', (dialog) => dialog.dismiss())
  await card.getByRole('button', { name: 'Удалить' }).click()
  await expect(card).toBeVisible()

  page.once('dialog', (dialog) => dialog.accept())
  await card.getByRole('button', { name: 'Удалить' }).click()
  await expect(card).toHaveCount(0)
})
