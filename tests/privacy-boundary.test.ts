import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

import type { AnswerSubmission, MissionRepository } from '../src/types'

const migration = readFileSync(
  new URL('../supabase/migrations/202607230001_initial_schema.sql', import.meta.url),
  'utf8',
)
const supabaseAdapter = readFileSync(
  new URL('../src/data-access/supabase.ts', import.meta.url),
  'utf8',
)
const contracts = readFileSync(new URL('../src/types.ts', import.meta.url), 'utf8')

describe('location privacy boundary', () => {
  it('does not permit coordinates in an answer at compile time', () => {
    const valid: AnswerSubmission = {
      missionId: crypto.randomUUID(),
      choice: '問題なし',
      photo: null,
    }
    expect(Object.keys(valid).sort()).toEqual(['choice', 'missionId', 'photo'])

    const invalid: AnswerSubmission = {
      missionId: crypto.randomUUID(),
      choice: '問題なし',
      photo: null,
      // @ts-expect-error Coordinates must never be accepted as answer data.
      lat: 35,
    }
    expect('lat' in invalid).toBe(true)
  })

  it('defines mission listing without a location argument', () => {
    const signature = contracts.match(/listActivePublic\(([^)]*)\)/)?.[1]
    expect(signature).toBe('')
    expect<Parameters<MissionRepository['listActivePublic']>>([]).toEqual([])
  })

  it('does not create responder location columns in answers', () => {
    const answerTable = migration.match(
      /create table public\.answers \(([\s\S]*?)\n\);/,
    )?.[1]
    expect(answerTable).toBeTruthy()
    expect(answerTable).not.toMatch(/\b(lat|latitude|lng|longitude|location)\b/i)
  })

  it('submits only mission, choice, and optional photo path to Supabase', () => {
    const rpcArguments = supabaseAdapter.match(
      /rpc\('submit_answer', \{([\s\S]*?)\n\s+\}\)/,
    )?.[1]
    expect(rpcArguments).toContain('p_mission_id')
    expect(rpcArguments).toContain('p_choice')
    expect(rpcArguments).toContain('p_photo_url')
    expect(rpcArguments).not.toMatch(/\b(lat|latitude|lng|longitude|location)\b/i)
  })
})

