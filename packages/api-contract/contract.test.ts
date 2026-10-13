import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const openapi = readFileSync(
  fileURLToPath(new URL('./generated/openapi.yaml', import.meta.url)),
  'utf8',
)

describe('generated OpenAPI coverage', () => {
  it.each([
    '/api/event-types',
    '/api/event-types/{publicId}',
    '/api/event-types/{publicId}/slots',
    '/api/bookings',
    '/api/bookings/{id}',
    '/api/manage/event-types',
    '/api/manage/availability',
    '/api/manage/availability/exceptions',
    '/api/manage/bookings',
  ])('contains the %s route', (route) => {
    expect(openapi).toContain(`  ${route}:`)
  })

  it.each([
    'guestEventTypesListPublicEventTypes',
    'guestEventTypesListAvailableSlots',
    'guestBookingsCreateBooking',
    'guestBookingsGetBooking',
    'ownerEventTypesCreateEventType',
    'ownerAvailabilityReplaceAvailability',
    'ownerAvailabilityPutAvailabilityException',
    'ownerBookingsListFutureBookings',
  ])('contains the %s operation', (operationId) => {
    expect(openapi).toContain(`operationId: ${operationId}`)
  })
})
