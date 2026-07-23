-- すべて架空の寺社名です。座標は京都中心部のデモ表示用です。
-- 有効期限はseed投入時からの相対指定なので、再投入後すぐ公開面で確認できます。
insert into public.missions (
  id,
  title,
  lat,
  lng,
  question,
  choices,
  note,
  expires_at,
  visibility,
  status,
  reward_miles
)
values
  (
    '11111111-1111-4111-8111-111111111111',
    '青葉神社・石灯籠',
    35.0149,
    135.7678,
    '正面の石灯籠は倒れていませんか？',
    array['倒れていない', '傾き・破損が見える', '公道から確認できない'],
    '人を撮らず、公道から見える範囲だけで確認してください。',
    now() + interval '2 hours',
    'public',
    'active',
    3
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    '月影寺・山門',
    35.0092,
    135.7726,
    '山門の前に通行を妨げる落下物はありませんか？',
    array['見当たらない', '小さな落下物がある', '通行に支障がある', '公道から確認できない'],
    '境内へ入らず、人の顔や車のナンバーを撮影しないでください。',
    now() + interval '90 minutes',
    'public',
    'active',
    3
  ),
  (
    '33333333-3333-4333-8333-333333333333',
    '静森稲荷・案内板',
    35.0174,
    135.7609,
    '入口の案内板は読める状態ですか？',
    array['問題なく読める', '一部が隠れている', '倒れている・破損している', '公道から確認できない'],
    '人を撮らず、公道から見える範囲だけで確認してください。',
    now() + interval '45 minutes',
    'public',
    'active',
    3
  )
on conflict (id) do update set
  title = excluded.title,
  lat = excluded.lat,
  lng = excluded.lng,
  question = excluded.question,
  choices = excluded.choices,
  note = excluded.note,
  expires_at = excluded.expires_at,
  visibility = excluded.visibility,
  status = excluded.status,
  reward_miles = excluded.reward_miles,
  updated_at = now();

