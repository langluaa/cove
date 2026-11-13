-- =====================================================================
-- Cove migration 002: friends + direct messages
-- Run AFTER schema.sql. Paste into Supabase → SQL Editor → Run.
-- =====================================================================

-- ---------- Tables ----------------------------------------------------

create table public.friendships (
  id           uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  addressee_id uuid not null references public.profiles (id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  check (requester_id <> addressee_id)
);
-- One row per pair of people, whichever direction the request went.
create unique index friendships_pair on public.friendships
  (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index on public.friendships (addressee_id);

create table public.dm_channels (
  id              uuid primary key default gen_random_uuid(),
  user_a          uuid not null references public.profiles (id) on delete cascade,
  user_b          uuid not null references public.profiles (id) on delete cascade,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  check (user_a < user_b),
  unique (user_a, user_b)
);
create index on public.dm_channels (user_b);

create table public.dm_messages (
  id         bigint generated always as identity primary key,
  dm_id      uuid not null references public.dm_channels (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  content    text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now(),
  edited_at  timestamptz
);
create index on public.dm_messages (dm_id, created_at desc);

-- ---------- Helpers ----------------------------------------------------

create function public.is_dm_member(did uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from dm_channels
                 where id = did and auth.uid() in (user_a, user_b));
$$;

create function public.are_friends(x uuid, y uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from friendships
                 where status = 'accepted'
                   and least(requester_id, addressee_id) = least(x, y)
                   and greatest(requester_id, addressee_id) = greatest(x, y));
$$;

create function public.share_a_server(x uuid, y uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from server_members m1
                 join server_members m2 on m1.server_id = m2.server_id
                 where m1.user_id = x and m2.user_id = y);
$$;

-- ---------- Actions ----------------------------------------------------

-- Send a friend request by username. If they already asked you, this accepts it.
create function public.send_friend_request(target_username text)
returns text language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  them uuid;
  existing friendships;
begin
  if me is null then raise exception 'Not signed in'; end if;
  select id into them from profiles where lower(username) = lower(trim(leading '@' from trim(target_username)));
  if them is null then raise exception 'No one with that username. Double-check the spelling.'; end if;
  if them = me then raise exception 'You can''t add yourself.'; end if;

  select * into existing from friendships
   where least(requester_id, addressee_id) = least(me, them)
     and greatest(requester_id, addressee_id) = greatest(me, them);

  if found then
    if existing.status = 'accepted' then raise exception 'You''re already friends.'; end if;
    if existing.requester_id = me then raise exception 'Request already sent.'; end if;
    update friendships set status = 'accepted' where id = existing.id;
    return 'accepted';
  end if;

  insert into friendships (requester_id, addressee_id) values (me, them);
  return 'sent';
end;
$$;

-- Open (or create) the DM with someone. Allowed if you're friends or share a server.
create function public.open_dm(other uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  a uuid := least(me, other);
  b uuid := greatest(me, other);
  did uuid;
begin
  if me is null then raise exception 'Not signed in'; end if;
  if other = me then raise exception 'You can''t DM yourself.'; end if;
  select id into did from dm_channels where user_a = a and user_b = b;
  if did is not null then return did; end if;
  if not (are_friends(me, other) or share_a_server(me, other)) then
    raise exception 'You can only DM friends or people in your servers.';
  end if;
  insert into dm_channels (user_a, user_b) values (a, b)
  on conflict (user_a, user_b) do update set user_a = excluded.user_a
  returning id into did;
  return did;
end;
$$;

-- ---------- Triggers ---------------------------------------------------

-- New DM message → bump the conversation to the top of the list.
create function public.bump_dm() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update dm_channels set last_message_at = new.created_at where id = new.dm_id;
  return new;
end;
$$;
create trigger dm_messages_bump after insert on public.dm_messages
  for each row execute function public.bump_dm();

-- Only content can be edited; editing stamps edited_at.
create function public.stamp_dm_edit() returns trigger language plpgsql as $$
begin
  new.dm_id      := old.dm_id;
  new.author_id  := old.author_id;
  new.created_at := old.created_at;
  new.edited_at  := now();
  return new;
end;
$$;
create trigger dm_messages_stamp_edit before update on public.dm_messages
  for each row execute function public.stamp_dm_edit();

-- Accepting a request can only flip status to accepted.
create function public.lock_friendship_fields() returns trigger language plpgsql as $$
begin
  new.requester_id := old.requester_id;
  new.addressee_id := old.addressee_id;
  new.created_at   := old.created_at;
  return new;
end;
$$;
create trigger friendships_lock_fields before update on public.friendships
  for each row execute function public.lock_friendship_fields();

-- ---------- Row Level Security ----------------------------------------

alter table public.friendships enable row level security;
alter table public.dm_channels enable row level security;
alter table public.dm_messages enable row level security;

-- friendships: both people see it; the receiver accepts; either side removes
create policy "see own friendships" on public.friendships
  for select to authenticated using (auth.uid() in (requester_id, addressee_id));
create policy "receiver accepts" on public.friendships
  for update to authenticated
  using (addressee_id = auth.uid() and status = 'pending')
  with check (status = 'accepted');
create policy "either side removes" on public.friendships
  for delete to authenticated using (auth.uid() in (requester_id, addressee_id));

-- dm_channels: only the two people in it (created through open_dm)
create policy "see own dms" on public.dm_channels
  for select to authenticated using (auth.uid() in (user_a, user_b));

-- dm_messages: the two people read & post; authors edit & delete their own
create policy "dm members read" on public.dm_messages
  for select to authenticated using (is_dm_member(dm_id));
create policy "dm members post" on public.dm_messages
  for insert to authenticated with check (author_id = auth.uid() and is_dm_member(dm_id));
create policy "authors edit dm" on public.dm_messages
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "authors delete dm" on public.dm_messages
  for delete to authenticated using (author_id = auth.uid());

-- ---------- Realtime ---------------------------------------------------

alter table public.friendships replica identity full;
alter table public.dm_channels replica identity full;
alter table public.dm_messages replica identity full;

alter publication supabase_realtime add table public.friendships;
alter publication supabase_realtime add table public.dm_channels;
alter publication supabase_realtime add table public.dm_messages;
