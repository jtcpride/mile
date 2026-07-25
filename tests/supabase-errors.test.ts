import { describe, expect, it } from 'vitest'

import { normalizeSupabaseError } from '../src/data-access/supabase'

describe('Supabase answer errors', () => {
  it('shows a precise message for a duplicate answer returned as a plain object', () => {
    const error = normalizeSupabaseError({
      code: '23505',
      details: 'Key (mission_id, anon_id) already exists.',
      message:
        'duplicate key value violates unique constraint "answers_one_per_anonymous_user"',
    })

    expect(error.message).toBe(
      'この端末からは、すでにこのミッションへ回答済みです。',
    )
  })

  it('keeps unavailable mission errors distinct from network failures', () => {
    const error = normalizeSupabaseError({
      code: 'P0002',
      message: 'mission is unavailable',
    })

    expect(error.message).toBe(
      'このミッションは終了したか、公開されていません。',
    )
  })
})
