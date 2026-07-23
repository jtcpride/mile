import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  new URL('../supabase/migrations/202607230001_initial_schema.sql', import.meta.url),
  'utf8',
)

describe('database guardrails', () => {
  it('limits public reads to public, active, unexpired missions', () => {
    expect(migration).toContain("visibility = 'public'")
    expect(migration).toContain("status = 'active'")
    expect(migration).toContain('expires_at > now()')
  })

  it('allows one answer per anonymous user and mission', () => {
    expect(migration).toMatch(
      /unique\s*\(mission_id,\s*anon_id\)/,
    )
  })

  it('records identity and confirmation time on the server', () => {
    expect(migration).toContain('confirmed_at timestamptz not null default now()')
    expect(migration).toContain('anon_id uuid not null default auth.uid()')
  })

  it('does not expose answers through direct public policies', () => {
    expect(migration).not.toMatch(
      /create policy[\s\S]*?\bon public\.answers\b[\s\S]*?\bfor select\b/i,
    )
  })

  it('keeps answer photos in a private bucket', () => {
    expect(migration).toMatch(
      /'answer-photos',\s*'answer-photos',\s*false/,
    )
  })
})

