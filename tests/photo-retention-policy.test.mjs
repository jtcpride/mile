import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  calculatePhotoCutoff,
  isExpiredPhotoRow,
  isSafeAnswerPhotoPath,
  partitionPhotoRows,
} from '../scripts/photo-retention-policy.mjs'

const eligiblePath =
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/' +
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/' +
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc.jpg'
const purgeScript = readFileSync(
  new URL('../scripts/purge-expired-photos.mjs', import.meta.url),
  'utf8',
)
const purgeWorkflow = readFileSync(
  new URL('../.github/workflows/purge-expired-photos.yml', import.meta.url),
  'utf8',
)

describe('photo retention policy', () => {
  const now = new Date('2026-07-25T12:00:00.000Z')
  const cutoff = calculatePhotoCutoff(now, 90)

  it('uses a strict 90-day server-time cutoff', () => {
    expect(cutoff).toBe('2026-04-26T12:00:00.000Z')
    expect(
      isExpiredPhotoRow(
        { photo_url: eligiblePath, confirmed_at: '2026-04-26T11:59:59.999Z' },
        cutoff,
      ),
    ).toBe(true)
    expect(
      isExpiredPhotoRow(
        { photo_url: eligiblePath, confirmed_at: '2026-04-26T12:00:00.000Z' },
        cutoff,
      ),
    ).toBe(false)
  })

  it('accepts only the private answer-photo path shape', () => {
    expect(isSafeAnswerPhotoPath(eligiblePath)).toBe(true)
    expect(isSafeAnswerPhotoPath('other-bucket/photo.jpg')).toBe(false)
    expect(isSafeAnswerPhotoPath('../answer-photos/photo.jpg')).toBe(false)
    expect(isSafeAnswerPhotoPath('aaaaaaaa/photo.jpg')).toBe(false)
  })

  it('keeps fresh and malformed photos out of the deletion set', () => {
    const expired = {
      id: 'expired',
      photo_url: eligiblePath,
      confirmed_at: '2026-04-01T00:00:00.000Z',
    }
    const fresh = {
      id: 'fresh',
      photo_url: eligiblePath,
      confirmed_at: '2026-07-25T11:00:00.000Z',
    }
    const malformed = {
      id: 'malformed',
      photo_url: 'unexpected/path.jpg',
      confirmed_at: '2026-04-01T00:00:00.000Z',
    }

    expect(partitionPhotoRows([expired, fresh, malformed], cutoff)).toEqual({
      eligible: [expired],
      rejected: [fresh, malformed],
    })
  })

  it('defaults manual cleanup to dry-run and uses only the dedicated secret', () => {
    expect(purgeWorkflow).toMatch(/dry_run:[\s\S]*?default:\s*true/)
    expect(purgeWorkflow).toContain('SUPABASE_PHOTO_PURGE_SECRET_KEY')
    expect(purgeWorkflow).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(purgeScript).toContain("from('answer-photos').remove(paths)")
  })

  it('does not print photo paths or answer identifiers', () => {
    expect(purgeScript).not.toContain('console.log(paths')
    expect(purgeScript).not.toContain('console.log(rows')
    expect(purgeScript).not.toContain('${row.')
  })
})
