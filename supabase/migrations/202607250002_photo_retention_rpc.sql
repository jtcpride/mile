create or replace function public.list_expired_answer_photos(
  p_retention_days integer default 90,
  p_limit integer default 1000
)
returns table (
  answer_id uuid,
  photo_path text,
  confirmed_at timestamptz
)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if p_retention_days < 1 or p_retention_days > 3650 then
    raise exception 'retention days must be between 1 and 3650'
      using errcode = '22023';
  end if;

  if p_limit < 1 or p_limit > 1000 then
    raise exception 'limit must be between 1 and 1000'
      using errcode = '22023';
  end if;

  return query
  select a.id, a.photo_url, a.confirmed_at
  from public.answers a
  where a.photo_url is not null
    and a.confirmed_at < now() - make_interval(days => p_retention_days)
  order by a.confirmed_at
  limit p_limit;
end;
$$;

create or replace function public.clear_expired_answer_photo(
  p_answer_id uuid,
  p_photo_path text,
  p_retention_days integer default 90
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_retention_days < 1 or p_retention_days > 3650 then
    raise exception 'retention days must be between 1 and 3650'
      using errcode = '22023';
  end if;

  update public.answers
  set photo_url = null
  where id = p_answer_id
    and photo_url = p_photo_path
    and confirmed_at < now() - make_interval(days => p_retention_days);

  return found;
end;
$$;

revoke all on function public.list_expired_answer_photos(integer, integer)
  from public, anon, authenticated;
revoke all on function public.clear_expired_answer_photo(uuid, text, integer)
  from public, anon, authenticated;

grant execute on function public.list_expired_answer_photos(integer, integer)
  to service_role;
grant execute on function public.clear_expired_answer_photo(uuid, text, integer)
  to service_role;
