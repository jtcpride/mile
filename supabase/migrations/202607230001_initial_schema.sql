create extension if not exists pgcrypto;

create table public.missions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 120),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  question text not null check (char_length(question) between 1 and 300),
  choices text[] not null check (cardinality(choices) between 2 and 8),
  note text not null default '',
  expires_at timestamptz not null,
  visibility text not null default 'public'
    check (visibility in ('public', 'limited')),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'cancelled')),
  reward_miles integer not null default 3
    check (reward_miles between 0 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.missions is
  '運営だけが登録する見守りミッション。公開面に投稿UIは存在しない。';
comment on column public.missions.reward_miles is
  '回答完了時に付与するマイル。初期運用では全ミッション同値。';

create table public.answers (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete restrict,
  choice text not null,
  photo_url text,
  confirmed_at timestamptz not null default now(),
  anon_id uuid not null default auth.uid(),
  constraint answers_one_per_anonymous_user unique (mission_id, anon_id)
);

comment on table public.answers is
  '現在地を含まない回答。confirmed_atとanon_idはサーバー側で確定する。';
comment on column public.answers.photo_url is
  '公開URLではなく、非公開Storage bucket内のobject path。';

create index missions_public_active_expiry_idx
  on public.missions (expires_at)
  where visibility = 'public' and status = 'active';

create index answers_confirmed_at_with_photo_idx
  on public.answers (confirmed_at)
  where photo_url is not null;

alter table public.missions enable row level security;
alter table public.answers enable row level security;

create policy "public can read only active public unexpired missions"
  on public.missions
  for select
  to anon, authenticated
  using (
    visibility = 'public'
    and status = 'active'
    and expires_at > now()
  );

-- answersにはクライアント向けの直接SELECT/INSERTポリシーを作らない。
-- 回答は下のsubmit_answer関数だけを通し、公開面から集計や他者回答を読めなくする。

create or replace function public.submit_answer(
  p_mission_id uuid,
  p_choice text,
  p_photo_url text default null
)
returns table (
  answer_id uuid,
  answer_confirmed_at timestamptz,
  earned_miles integer,
  total_miles bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_mission public.missions%rowtype;
  v_answer public.answers%rowtype;
  v_total bigint;
begin
  if v_uid is null then
    raise exception 'anonymous authentication is required'
      using errcode = '28000';
  end if;

  select *
  into v_mission
  from public.missions
  where id = p_mission_id
    and visibility = 'public'
    and status = 'active'
    and expires_at > now();

  if not found then
    raise exception 'mission is unavailable'
      using errcode = 'P0002';
  end if;

  if p_choice is null or not (p_choice = any(v_mission.choices)) then
    raise exception 'choice is not allowed for this mission'
      using errcode = '22023';
  end if;

  if p_photo_url is not null and (
    split_part(p_photo_url, '/', 1) <> v_uid::text
    or split_part(p_photo_url, '/', 2) <> p_mission_id::text
  ) then
    raise exception 'photo path does not belong to this user and mission'
      using errcode = '22023';
  end if;

  insert into public.answers (mission_id, choice, photo_url, anon_id)
  values (p_mission_id, p_choice, p_photo_url, v_uid)
  returning * into v_answer;

  select coalesce(sum(m.reward_miles), 0)
  into v_total
  from public.answers a
  join public.missions m on m.id = a.mission_id
  where a.anon_id = v_uid;

  return query
  select v_answer.id, v_answer.confirmed_at, v_mission.reward_miles, v_total;
end;
$$;

revoke all on function public.submit_answer(uuid, text, text) from public;
grant execute on function public.submit_answer(uuid, text, text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'answer-photos',
  'answer-photos',
  false,
  1200000,
  array['image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "anonymous users can upload to their own mission folder"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'answer-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "anonymous users can read their own uploaded photos"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'answer-photos'
    and owner_id = auth.uid()::text
  );

create policy "anonymous users can remove their own orphan upload"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'answer-photos'
    and owner_id = auth.uid()::text
  );

