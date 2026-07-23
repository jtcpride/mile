import { describe, expect, it, vi } from 'vitest'

import { formatRemaining, remainingMilliseconds } from '../src/lib/time'

describe('mission expiry', () => {
  it('never returns a negative remaining duration', () => {
    expect(remainingMilliseconds('2026-07-23T00:00:00Z', Date.parse('2026-07-23T01:00:00Z'))).toBe(0)
  })

  it('makes expired missions explicit', () => {
    expect(formatRemaining('2026-07-23T00:00:00Z', Date.parse('2026-07-23T01:00:00Z'))).toBe('期限切れ')
  })

  it('rounds an active deadline up to the next minute', () => {
    vi.setSystemTime(new Date('2026-07-23T00:00:00Z'))
    expect(formatRemaining('2026-07-23T00:42:01Z')).toBe('残り 43分')
    vi.useRealTimers()
  })
})

