import type { DataAccess } from '../types'
import { DemoAnswerRepository, DemoMissionRepository } from './demo'
import { createSupabaseRepositories } from './supabase'

export function createDataAccess(): DataAccess {
  const url = import.meta.env.VITE_SUPABASE_URL?.trim()
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()
  const forceDemo = import.meta.env.VITE_DEMO_MODE === 'true'

  if (!forceDemo && url && publishableKey) {
    return {
      ...createSupabaseRepositories(url, publishableKey),
      mode: 'supabase',
    }
  }

  return {
    missions: new DemoMissionRepository(),
    answers: new DemoAnswerRepository(),
    mode: 'demo',
  }
}

