const UUID_PATTERN =
  '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const PHOTO_PATH_PATTERN = new RegExp(
  `^${UUID_PATTERN}/${UUID_PATTERN}/${UUID_PATTERN}\\.(?:jpe?g|webp)$`,
  'i',
)

export function calculatePhotoCutoff(now, retentionDays) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError('now must be a valid Date.')
  }
  if (!Number.isInteger(retentionDays) || retentionDays < 1) {
    throw new TypeError('retentionDays must be a positive integer.')
  }

  return new Date(
    now.getTime() - retentionDays * 24 * 60 * 60 * 1000,
  ).toISOString()
}

export function isSafeAnswerPhotoPath(path) {
  return typeof path === 'string' && PHOTO_PATH_PATTERN.test(path)
}

export function isExpiredPhotoRow(row, cutoff) {
  if (!row || typeof row !== 'object') return false
  if (!isSafeAnswerPhotoPath(row.photo_url)) return false

  const confirmedAt = Date.parse(row.confirmed_at)
  const cutoffTime = Date.parse(cutoff)
  return (
    Number.isFinite(confirmedAt) &&
    Number.isFinite(cutoffTime) &&
    confirmedAt < cutoffTime
  )
}

export function partitionPhotoRows(rows, cutoff) {
  return rows.reduce(
    (result, row) => {
      if (isExpiredPhotoRow(row, cutoff)) {
        result.eligible.push(row)
      } else {
        result.rejected.push(row)
      }
      return result
    },
    { eligible: [], rejected: [] },
  )
}
