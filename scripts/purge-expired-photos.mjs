import { createClient } from '@supabase/supabase-js'

import {
  calculatePhotoCutoff,
  partitionPhotoRows,
} from './photo-retention-policy.mjs'

const retentionDays = Number.parseInt(process.env.PHOTO_RETENTION_DAYS || '90', 10)
const supabaseUrl = process.env.SUPABASE_URL
const secretKey = process.env.SUPABASE_PHOTO_PURGE_SECRET_KEY
const dryRun = process.env.PHOTO_PURGE_DRY_RUN !== 'false'

if (!supabaseUrl || !secretKey) {
  console.error(
    'SUPABASE_URL and SUPABASE_PHOTO_PURGE_SECRET_KEY are required.',
  )
  process.exit(1)
}

const client = createClient(supabaseUrl, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const cutoff = calculatePhotoCutoff(new Date(), retentionDays)

const { data: expiredAnswers, error: queryError } = await client
  .from('answers')
  .select('id, photo_url, confirmed_at')
  .not('photo_url', 'is', null)
  .lt('confirmed_at', cutoff)
  .order('confirmed_at', { ascending: true })
  .limit(1000)

if (queryError) {
  throw queryError
}

const { eligible: rows, rejected } = partitionPhotoRows(
  expiredAnswers || [],
  cutoff,
)
if (rejected.length > 0) {
  throw new Error(
    `${rejected.length} candidate row(s) failed the retention safety checks; no deletion was attempted.`,
  )
}

if (rows.length === 0) {
  console.log(`No photos older than ${retentionDays} days.`)
  process.exit(0)
}

if (dryRun) {
  console.log(
    `Dry run: ${rows.length} photo(s) are older than ${retentionDays} days; no deletion was attempted.`,
  )
  process.exit(0)
}

const paths = rows.map((row) => row.photo_url)
const { error: removeError } = await client.storage.from('answer-photos').remove(paths)
if (removeError) {
  throw removeError
}

for (const row of rows) {
  const { error: updateError } = await client
    .from('answers')
    .update({ photo_url: null })
    .eq('id', row.id)
    .eq('photo_url', row.photo_url)
    .lt('confirmed_at', cutoff)

  if (updateError) {
    throw updateError
  }
}

console.log(`Deleted ${paths.length} photo(s) older than ${retentionDays} days.`)
