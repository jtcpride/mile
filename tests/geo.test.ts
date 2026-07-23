import { describe, expect, it } from 'vitest'

import { distanceInMeters, formatDistance } from '../src/lib/geo'

describe('distanceInMeters', () => {
  it('returns zero for the same point', () => {
    expect(distanceInMeters({ lat: 35, lng: 135 }, { lat: 35, lng: 135 })).toBe(0)
  })

  it('calculates a plausible distance without sending coordinates anywhere', () => {
    const distance = distanceInMeters(
      { lat: 35.0116, lng: 135.7681 },
      { lat: 35.0149, lng: 135.7678 },
    )
    expect(distance).toBeGreaterThan(350)
    expect(distance).toBeLessThan(380)
  })
})

describe('formatDistance', () => {
  it('uses metres nearby and kilometres farther away', () => {
    expect(formatDistance(347)).toBe('350m')
    expect(formatDistance(1_480)).toBe('1.5km')
  })
})

