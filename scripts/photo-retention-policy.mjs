const UUID_PATTERN =
  '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const PHOTO_PATH_PATTERN = new RegExp(
  `^${UUID_PATTERN}/${UUID_PATTERN}/${UUID_PATTERN}\\.(?:jpe?g|webp)$`,
  'i',
)
const UUID_VALUE_PATTERN = new RegExp(`^${UUID_PATTERN}$`, 'i')

export function validateRetentionDays(retentionDays) {
  if (!Number.isInteger(retentionDays) || retentionDays < 1) {
    throw new TypeError('retentionDays must be a positive integer.')
  }
}

export function isSafeAnswerPhotoPath(path) {
  return typeof path === 'string' && PHOTO_PATH_PATTERN.test(path)
}

export function isPurgeCandidate(row) {
  if (!row || typeof row !== 'object') return false
  if (!isSafeAnswerPhotoPath(row.photo_path)) return false
  return (
    UUID_VALUE_PATTERN.test(row.answer_id) &&
    Number.isFinite(Date.parse(row.confirmed_at))
  )
}

export function partitionPhotoRows(rows) {
  return rows.reduce(
    (result, row) => {
      if (isPurgeCandidate(row)) {
        result.eligible.push(row)
      } else {
        result.rejected.push(row)
      }
      return result
    },
    { eligible: [], rejected: [] },
  )
}
