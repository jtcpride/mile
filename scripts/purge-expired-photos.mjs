import { createClient } from '@supabase/supabase-js'

const retentionDays = Number.parseInt(process.env.PHOTO_RETENTION_DAYS || '90', 10)
const supabaseUrl = process.env.SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  process.exit(1)
}

if (!Number.isInteger(retentionDays) || retentionDays < 1) {
  console.error('PHOTO_RETENTION_DAYS must be a positive integer.')
  process.exit(1)
}

const client = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})
const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString()

const { data: expiredAnswers, error: queryError } = await client
  .from('answers')
  .select('id, photo_url')
  .not('photo_url', 'is', null)
  .lt('confirmed_at', cutoff)
  .limit(1000)

if (queryError) {
  throw queryError
}

const rows = (expiredAnswers || []).filter((row) => typeof row.photo_url === 'string')
if (rows.length === 0) {
  console.log(`No photos older than ${retentionDays} days.`)
  process.exit(0)
}

const paths = rows.map((row) => row.photo_url)
const { error: removeError } = await client.storage.from('answer-photos').remove(paths)
if (removeError) {
  throw removeError
}

const answerIds = rows.map((row) => row.id)
const { error: updateError } = await client
  .from('answers')
  .update({ photo_url: null })
  .in('id', answerIds)

if (updateError) {
  throw updateError
}

console.log(`Deleted ${paths.length} photo(s) older than ${retentionDays} days.`)

