export type MissionVisibility = 'public' | 'limited'
export type MissionStatus = 'draft' | 'active' | 'cancelled'

export interface Coordinates {
  lat: number
  lng: number
}

export interface Mission {
  id: string
  title: string
  lat: number
  lng: number
  question: string
  choices: string[]
  note: string
  expiresAt: string
  visibility: MissionVisibility
  status: MissionStatus
  rewardMiles: number
}

// Privacy boundary: an answer can never contain the responder's coordinates.
export interface AnswerSubmission {
  missionId: string
  choice: string
  photo: File | null
}

export interface AnswerReceipt {
  answerId: string
  confirmedAt: string
  earnedMiles: number
  totalMiles: number
}

export interface MissionRepository {
  listActivePublic(): Promise<Mission[]>
  getActivePublicById(id: string): Promise<Mission | null>
}

export interface AnswerRepository {
  submit(input: AnswerSubmission): Promise<AnswerReceipt>
}

export interface DataAccess {
  missions: MissionRepository
  answers: AnswerRepository
  mode: 'supabase' | 'demo'
}

