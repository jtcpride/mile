import { createClient } from '@supabase/supabase-js'

import {
  partitionPhotoRows,
  validateRetentionDays,
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
validateRetentionDays(retentionDays)

const { data: expiredAnswers, error: queryError } = await client.rpc(
  'list_expired_answer_photos',
  {
    p_retention_days: retentionDays,
    p_limit: 1000,
  },
)

if (queryError) {
  throw queryError
}

const { eligible: rows, rejected } = partitionPhotoRows(
  expiredAnswers || [],
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

const paths = rows.map((row) => row.photo_path)
const { error: removeError } = await client.storage.from('answer-photos').remove(paths)
if (removeError) {
  throw removeError
}

for (const row of rows) {
  const { data: cleared, error: updateError } = await client.rpc(
    'clear_expired_answer_photo',
    {
      p_answer_id: row.answer_id,
      p_photo_path: row.photo_path,
      p_retention_days: retentionDays,
    },
  )

  if (updateError) {
    throw updateError
  }
  if (cleared !== true) {
    throw new Error(
      'An expired answer changed during cleanup; its reference was not cleared.',
    )
  }
}

console.log(`Deleted ${paths.length} photo(s) older than ${retentionDays} days.`)
