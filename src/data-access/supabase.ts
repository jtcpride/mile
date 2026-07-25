import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type {
  AnswerReceipt,
  AnswerRepository,
  AnswerSubmission,
  Mission,
  MissionRepository,
} from '../types'

interface MissionRow {
  id: string
  title: string
  lat: number
  lng: number
  question: string
  choices: string[]
  note: string
  expires_at: string
  visibility: 'public' | 'limited'
  status: 'draft' | 'active' | 'cancelled'
  reward_miles: number
}

interface SubmitAnswerRow {
  answer_id: string
  answer_confirmed_at: string
  earned_miles: number
  total_miles: number
}

const missionColumns =
  'id,title,lat,lng,question,choices,note,expires_at,visibility,status,reward_miles'

function toMission(row: MissionRow): Mission {
  return {
    id: row.id,
    title: row.title,
    lat: row.lat,
    lng: row.lng,
    question: row.question,
    choices: row.choices,
    note: row.note,
    expiresAt: row.expires_at,
    visibility: row.visibility,
    status: row.status,
    rewardMiles: row.reward_miles,
  }
}

async function ensureAnonymousSession(client: SupabaseClient): Promise<string> {
  const { data: sessionData, error: sessionError } = await client.auth.getSession()
  if (sessionError) throw sessionError
  if (sessionData.session?.user.id) return sessionData.session.user.id

  const { data, error } = await client.auth.signInAnonymously()
  if (error || !data.user) {
    throw error || new Error('匿名セッションを開始できませんでした。')
  }
  return data.user.id
}

export class SupabaseMissionRepository implements MissionRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listActivePublic(): Promise<Mission[]> {
    const { data, error } = await this.client
      .from('missions')
      .select(missionColumns)
      .order('expires_at', { ascending: true })
    if (error) throw error
    return ((data || []) as MissionRow[]).map(toMission)
  }

  async getActivePublicById(id: string): Promise<Mission | null> {
    const { data, error } = await this.client
      .from('missions')
      .select(missionColumns)
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    return data ? toMission(data as MissionRow) : null
  }
}

export class SupabaseAnswerRepository implements AnswerRepository {
  constructor(private readonly client: SupabaseClient) {}

  async submit(input: AnswerSubmission): Promise<AnswerReceipt> {
    let uploadedPath: string | null = null

    try {
      const userId = await ensureAnonymousSession(this.client)
      if (input.photo) {
        uploadedPath = `${userId}/${input.missionId}/${crypto.randomUUID()}.jpg`
        const { error: uploadError } = await this.client.storage
          .from('answer-photos')
          .upload(uploadedPath, input.photo, {
            contentType: 'image/jpeg',
            cacheControl: '3600',
            upsert: false,
          })
        if (uploadError) {
          uploadedPath = null
          throw new PhotoUploadError(uploadError)
        }
      }

      const { data, error } = await this.client.rpc('submit_answer', {
        p_mission_id: input.missionId,
        p_choice: input.choice,
        p_photo_url: uploadedPath,
      })
      if (error) throw error

      const row = (data as SubmitAnswerRow[] | null)?.[0]
      if (!row) throw new Error('回答の確認情報を取得できませんでした。')

      return {
        answerId: row.answer_id,
        confirmedAt: row.answer_confirmed_at,
        earnedMiles: row.earned_miles,
        totalMiles: Number(row.total_miles),
      }
    } catch (error) {
      if (uploadedPath) {
        await this.client.storage.from('answer-photos').remove([uploadedPath])
      }
      throw normalizeSupabaseError(error)
    }
  }
}

class PhotoUploadError extends Error {
  constructor(cause: unknown) {
    super(readSupabaseError(cause))
    this.name = 'PhotoUploadError'
  }
}

function readSupabaseError(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message}`
  if (typeof error !== 'object' || error === null) return String(error)

  return ['code', 'message', 'details', 'hint', 'statusCode', 'error']
    .map((key) => Reflect.get(error, key))
    .filter((value): value is string | number => {
      return typeof value === 'string' || typeof value === 'number'
    })
    .join(' ')
}

export function normalizeSupabaseError(error: unknown): Error {
  if (error instanceof PhotoUploadError) {
    return new Error(
      '写真をアップロードできませんでした。通信状態を確認して、もう一度お試しください。',
    )
  }

  const message = readSupabaseError(error)
  if (
    message.includes('23505') ||
    message.includes('answers_one_per_anonymous_user') ||
    message.includes('duplicate key')
  ) {
    return new Error('この端末からは、すでにこのミッションへ回答済みです。')
  }
  if (message.includes('mission is unavailable')) {
    return new Error('このミッションは終了したか、公開されていません。')
  }
  if (message.includes('choice is not allowed')) {
    return new Error('回答の選択肢が正しくありません。')
  }
  return new Error('回答を送信できませんでした。通信状態を確認して、もう一度お試しください。')
}

export function createSupabaseRepositories(url: string, publishableKey: string) {
  const client = createClient(url, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  })

  return {
    missions: new SupabaseMissionRepository(client),
    answers: new SupabaseAnswerRepository(client),
  }
}
