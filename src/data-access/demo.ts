import type {
  AnswerReceipt,
  AnswerRepository,
  AnswerSubmission,
  Mission,
  MissionRepository,
} from '../types'

const DEMO_ANSWERED_KEY = 'mairu:demo-answered-missions'
const DEMO_MILES_KEY = 'mairu:demo-total-miles'
const startedAt = Date.now()

const demoMissions: Mission[] = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    title: '青葉神社・石灯籠',
    lat: 35.0149,
    lng: 135.7678,
    question: '正面の石灯籠は倒れていませんか？',
    choices: ['倒れていない', '傾き・破損が見える', '公道から確認できない'],
    note: '人を撮らず、公道から見える範囲だけで確認してください。',
    expiresAt: new Date(startedAt + 2 * 60 * 60 * 1000).toISOString(),
    visibility: 'public',
    status: 'active',
    rewardMiles: 3,
  },
  {
    id: '22222222-2222-4222-8222-222222222222',
    title: '月影寺・山門',
    lat: 35.0092,
    lng: 135.7726,
    question: '山門の前に通行を妨げる落下物はありませんか？',
    choices: ['見当たらない', '小さな落下物がある', '通行に支障がある', '公道から確認できない'],
    note: '境内へ入らず、人の顔や車のナンバーを撮影しないでください。',
    expiresAt: new Date(startedAt + 90 * 60 * 1000).toISOString(),
    visibility: 'public',
    status: 'active',
    rewardMiles: 3,
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    title: '静森稲荷・案内板',
    lat: 35.0174,
    lng: 135.7609,
    question: '入口の案内板は読める状態ですか？',
    choices: ['問題なく読める', '一部が隠れている', '倒れている・破損している', '公道から確認できない'],
    note: '人を撮らず、公道から見える範囲だけで確認してください。',
    expiresAt: new Date(startedAt + 45 * 60 * 1000).toISOString(),
    visibility: 'public',
    status: 'active',
    rewardMiles: 3,
  },
]

function activePublicMissions(): Mission[] {
  const now = Date.now()
  return demoMissions.filter(
    (mission) =>
      mission.visibility === 'public' &&
      mission.status === 'active' &&
      new Date(mission.expiresAt).getTime() > now,
  )
}

export class DemoMissionRepository implements MissionRepository {
  async listActivePublic(): Promise<Mission[]> {
    return structuredClone(activePublicMissions())
  }

  async getActivePublicById(id: string): Promise<Mission | null> {
    return structuredClone(activePublicMissions().find((mission) => mission.id === id) || null)
  }
}

export class DemoAnswerRepository implements AnswerRepository {
  async submit(input: AnswerSubmission): Promise<AnswerReceipt> {
    const mission = activePublicMissions().find((candidate) => candidate.id === input.missionId)
    if (!mission) throw new Error('このミッションは終了したか、公開されていません。')
    if (!mission.choices.includes(input.choice)) throw new Error('回答の選択肢が正しくありません。')

    const answered: string[] = JSON.parse(localStorage.getItem(DEMO_ANSWERED_KEY) || '[]')
    if (answered.includes(mission.id)) {
      throw new Error('この端末からは、すでにこのミッションへ回答済みです。')
    }

    const totalMiles = Number(localStorage.getItem(DEMO_MILES_KEY) || '0') + mission.rewardMiles
    localStorage.setItem(DEMO_ANSWERED_KEY, JSON.stringify([...answered, mission.id]))
    localStorage.setItem(DEMO_MILES_KEY, String(totalMiles))

    return {
      answerId: crypto.randomUUID(),
      confirmedAt: new Date().toISOString(),
      earnedMiles: mission.rewardMiles,
      totalMiles,
    }
  }
}

