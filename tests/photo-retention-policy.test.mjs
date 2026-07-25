import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import {
  isPurgeCandidate,
  isSafeAnswerPhotoPath,
  partitionPhotoRows,
  validateRetentionDays,
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
const retentionMigration = readFileSync(
  new URL(
    '../supabase/migrations/202607250002_photo_retention_rpc.sql',
    import.meta.url,
  ),
  'utf8',
)

describe('photo retention policy', () => {
  it('uses a strict 90-day database-server cutoff', () => {
    expect(retentionMigration).toContain(
      'confirmed_at < now() - make_interval(days => p_retention_days)',
    )
    expect(() => validateRetentionDays(90)).not.toThrow()
    expect(() => validateRetentionDays(0)).toThrow()
  })

  it('accepts only the private answer-photo path shape', () => {
    expect(isSafeAnswerPhotoPath(eligiblePath)).toBe(true)
    expect(isSafeAnswerPhotoPath('other-bucket/photo.jpg')).toBe(false)
    expect(isSafeAnswerPhotoPath('../answer-photos/photo.jpg')).toBe(false)
    expect(isSafeAnswerPhotoPath('aaaaaaaa/photo.jpg')).toBe(false)
  })

  it('keeps fresh and malformed photos out of the deletion set', () => {
    const expired = {
      answer_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      photo_path: eligiblePath,
      confirmed_at: '2026-04-01T00:00:00.000Z',
    }
    const fresh = {
      answer_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      photo_path: eligiblePath,
      confirmed_at: 'not-a-date',
    }
    const malformed = {
      answer_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      photo_path: 'unexpected/path.jpg',
      confirmed_at: '2026-04-01T00:00:00.000Z',
    }

    expect(isPurgeCandidate(expired)).toBe(true)
    expect(partitionPhotoRows([expired, fresh, malformed])).toEqual({
      eligible: [expired],
      rejected: [fresh, malformed],
    })
  })

  it('defaults manual cleanup to dry-run and uses only the dedicated secret', () => {
    expect(purgeWorkflow).toMatch(/dry_run:[\s\S]*?default:\s*true/)
    expect(purgeWorkflow).toContain('SUPABASE_PHOTO_PURGE_SECRET_KEY')
    expect(purgeWorkflow).not.toContain('SUPABASE_SERVICE_ROLE_KEY')
    expect(purgeScript).toContain("from('answer-photos').remove(paths)")
    expect(purgeScript).not.toContain(".from('answers')")
    expect(retentionMigration).not.toMatch(
      /grant\s+(?:select|update|delete|insert)[\s\S]*?public\.answers/i,
    )
    expect(retentionMigration).toMatch(
      /grant execute[\s\S]*?list_expired_answer_photos[\s\S]*?to service_role/i,
    )
  })

  it('does not print photo paths or answer identifiers', () => {
    expect(purgeScript).not.toContain('console.log(paths')
    expect(purgeScript).not.toContain('console.log(rows')
    expect(purgeScript).not.toContain('${row.')
  })
})
