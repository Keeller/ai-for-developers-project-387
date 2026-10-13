import { describe, expect, it } from 'vitest'

import {
  apiClient,
  guestBookingsCreateBooking,
  guestEventTypesListPublicEventTypes,
  ownerEventTypesCreateEventType,
} from './client'

describe('generated API SDK', () => {
  it('exposes typed owner and guest operations through the frontend boundary', () => {
    expect(typeof guestEventTypesListPublicEventTypes).toBe('function')
    expect(typeof guestBookingsCreateBooking).toBe('function')
    expect(typeof ownerEventTypesCreateEventType).toBe('function')
    expect(apiClient.getConfig().baseUrl).toBe('')
  })
})
