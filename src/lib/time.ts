export function remainingMilliseconds(expiresAt: string, now = Date.now()): number {
  return Math.max(0, new Date(expiresAt).getTime() - now)
}

export function formatRemaining(expiresAt: string, now = Date.now()): string {
  const remaining = remainingMilliseconds(expiresAt, now)
  if (remaining <= 0) return '期限切れ'

  const totalMinutes = Math.ceil(remaining / 60_000)
  if (totalMinutes < 60) return `残り ${totalMinutes}分`

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes === 0 ? `残り ${hours}時間` : `残り ${hours}時間${minutes}分`
}

export function formatConfirmedAt(confirmedAt: string): string {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).format(new Date(confirmedAt))
}

