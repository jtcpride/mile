import { describe, expect, it, vi } from 'vitest'

import {
  EMPTY_DETECTION_RESULT_VISIBLE_MS,
  TRANSIENT_DISMISS_FADE_MS,
  scheduleTransientDismiss,
} from '../src/lib/transient'

describe('transient detection result', () => {
  it('fades and hides an empty result after about five seconds', () => {
    const classes = new Set<string>()
    const target = {
      hidden: false,
      classList: {
        add: (name: string) => classes.add(name),
        remove: (name: string) => classes.delete(name),
      },
    }
    const tasks = new Map<number, { callback: () => void; delay: number }>()
    let nextTimer = 0
    const onDismissed = vi.fn()

    scheduleTransientDismiss(target, {
      schedule: (callback, delay) => {
        nextTimer += 1
        tasks.set(nextTimer, { callback, delay })
        return nextTimer
      },
      cancel: (timer) => {
        tasks.delete(timer)
      },
      onDismissed,
    })

    expect(tasks.get(1)?.delay).toBe(
      EMPTY_DETECTION_RESULT_VISIBLE_MS - TRANSIENT_DISMISS_FADE_MS,
    )
    tasks.get(1)?.callback()
    expect(classes.has('is-dismissing')).toBe(true)
    expect(target.hidden).toBe(false)
    expect(tasks.get(2)?.delay).toBe(TRANSIENT_DISMISS_FADE_MS)

    tasks.get(2)?.callback()
    expect(target.hidden).toBe(true)
    expect(classes.has('is-dismissing')).toBe(false)
    expect(onDismissed).toHaveBeenCalledOnce()
  })

  it('cancels a pending dismissal before a new detection result is shown', () => {
    const classes = new Set<string>()
    const target = {
      hidden: false,
      classList: {
        add: (name: string) => classes.add(name),
        remove: (name: string) => classes.delete(name),
      },
    }
    const cancelled: number[] = []

    const cancelDismiss = scheduleTransientDismiss(target, {
      schedule: () => 42,
      cancel: (timer) => cancelled.push(timer),
    })
    cancelDismiss()

    expect(cancelled).toEqual([42])
    expect(classes.has('is-dismissing')).toBe(false)
  })
})
