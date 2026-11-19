-- ============================================================================
-- Тренер – синхронизација (Supabase). Покреће се ЈЕДНОМ у новом пројекту:
-- Supabase → SQL Editor → New query → налијепите цијели садржај → Run.
-- Безбједно за поновно покретање (ништа се не брише).
--
-- Сервер чува САМО шифроване записе: садржај (payload) шифрује апликација на уређају
-- лозинком за шифровање коју сервер никад не види. Видљиви су само техничка поља
-- (назив табеле, идентификатор, вријеме измјене, обрисано).
-- ============================================================================

-- 1) Шифровани записи (сваки запис апликације = један ред)
create table if not exists public.trener_records (
  user_id    uuid        not null default auth.uid() references auth.users(id) on delete cascade,
  tbl        text        not null check (tbl ~ '^[a-zA-Z]{1,40}$'),
  id         text        not null check (length(id) between 1 and 100),
  updated_at timestamptz not null,
  deleted    boolean     not null default false,
  payload    text        not null,
  server_at  timestamptz not null default clock_timestamp(),
  primary key (user_id, tbl, id)
);
create index if not exists trener_records_pull on public.trener_records (user_id, server_at);

-- 2) Подаци за провјеру лозинке за шифровање (со и шифрована контролна вриједност)
create table if not exists public.trener_keys (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  salt       text not null,
  check_val  text not null,
  created_at timestamptz not null default now()
);

-- 3) Правила приступа: сваки налог види и мијења САМО своје записе
alter table public.trener_records enable row level security;
alter table public.trener_keys enable row level security;

drop policy if exists trener_records_own on public.trener_records;
create policy trener_records_own on public.trener_records
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists trener_keys_own on public.trener_keys;
create policy trener_keys_own on public.trener_keys
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.trener_records, public.trener_keys from anon;
grant select, insert, update, delete on public.trener_records, public.trener_keys to authenticated;

-- 4) Слање измјена: уписује се само НОВИЈА верзија записа (по времену измјене на уређају).
--    Враћа записе које сервер НИЈЕ прихватио јер има новију верзију (апликација их затим преузима).
create or replace function public.trener_push(records jsonb)
returns table (r_tbl text, r_id text)
language plpgsql
security invoker
set search_path = public
as $$
declare r jsonb; n int;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if jsonb_typeof(records) <> 'array' or jsonb_array_length(records) > 500 then
    raise exception 'records must be an array of at most 500 items';
  end if;
  for r in select * from jsonb_array_elements(records) loop
    insert into public.trener_records as t (user_id, tbl, id, updated_at, deleted, payload, server_at)
    values (auth.uid(), r->>'tbl', r->>'id', (r->>'updated_at')::timestamptz, coalesce((r->>'deleted')::boolean, false), r->>'payload', clock_timestamp())
    on conflict (user_id, tbl, id) do update
      set updated_at = excluded.updated_at, deleted = excluded.deleted, payload = excluded.payload, server_at = clock_timestamp()
      where excluded.updated_at > t.updated_at;
    get diagnostics n = row_count;
    if n = 0 then r_tbl := r->>'tbl'; r_id := r->>'id'; return next; end if;
  end loop;
end $$;
revoke all on function public.trener_push(jsonb) from public, anon;
grant execute on function public.trener_push(jsonb) to authenticated;

-- 5) Приложене датотеке налаза (PDF, слике) — шифроване, у приватној фасцикли налога
insert into storage.buckets (id, name, public)
values ('trener-prilozi', 'trener-prilozi', false)
on conflict (id) do nothing;

drop policy if exists trener_prilozi_own on storage.objects;
create policy trener_prilozi_own on storage.objects
  for all to authenticated
  using (bucket_id = 'trener-prilozi' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'trener-prilozi' and (storage.foldername(name))[1] = auth.uid()::text);
