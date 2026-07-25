export const EMPTY_DETECTION_RESULT_VISIBLE_MS = 5_000
export const TRANSIENT_DISMISS_FADE_MS = 300

type TransientTarget = {
  hidden: HTMLElement['hidden']
  classList: Pick<DOMTokenList, 'add' | 'remove'>
}

type Schedule = (callback: () => void, delay: number) => number
type Cancel = (timer: number) => void

export function scheduleTransientDismiss(
  target: TransientTarget,
  options: {
    schedule: Schedule
    cancel: Cancel
    onDismissed?: () => void
    visibleMs?: number
    fadeMs?: number
  },
): () => void {
  const visibleMs = options.visibleMs ?? EMPTY_DETECTION_RESULT_VISIBLE_MS
  const fadeMs = options.fadeMs ?? TRANSIENT_DISMISS_FADE_MS
  let hideTimer: number | null = null

  const fadeTimer = options.schedule(() => {
    target.classList.add('is-dismissing')
    hideTimer = options.schedule(() => {
      target.hidden = true
      target.classList.remove('is-dismissing')
      options.onDismissed?.()
    }, fadeMs)
  }, Math.max(0, visibleMs - fadeMs))

  return () => {
    options.cancel(fadeTimer)
    if (hideTimer !== null) options.cancel(hideTimer)
    target.classList.remove('is-dismissing')
  }
}
