-- =====================================================================
-- Cove database schema
-- Paste this whole file into Supabase → SQL Editor → New query → Run.
-- Safe to run on a fresh project.
-- =====================================================================

-- ---------- Tables ----------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text not null unique check (username ~ '^[a-zA-Z0-9_.]{2,32}$'),
  display_name text check (char_length(display_name) <= 32),
  avatar_color text not null default '#2bb3a3',
  created_at   timestamptz not null default now()
);

create table public.servers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 50),
  icon_color  text not null default '#2bb3a3',
  owner_id    uuid not null references public.profiles (id) on delete cascade,
  invite_code text not null unique default substr(md5(random()::text), 1, 8),
  created_at  timestamptz not null default now()
);

create table public.server_members (
  server_id uuid not null references public.servers (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  role      text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (server_id, user_id)
);

create table public.channels (
  id         uuid primary key default gen_random_uuid(),
  server_id  uuid not null references public.servers (id) on delete cascade,
  name       text not null check (name ~ '^[a-z0-9-]{1,32}$'),
  position   int  not null default 0,
  created_at timestamptz not null default now()
);

create table public.messages (
  id         bigint generated always as identity primary key,
  channel_id uuid not null references public.channels (id) on delete cascade,
  author_id  uuid not null references public.profiles (id) on delete cascade,
  content    text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now(),
  edited_at  timestamptz
);

create index on public.server_members (user_id);
create index on public.channels (server_id, position);
create index on public.messages (channel_id, created_at desc);

-- ---------- Helper functions (used by the security rules) -------------
-- "security definer" lets these look up membership without tripping over
-- the very rules they are used in.

create function public.is_member(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from server_members where server_id = sid and user_id = auth.uid());
$$;

create function public.is_owner(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from servers where id = sid and owner_id = auth.uid());
$$;

create function public.channel_server(cid uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select server_id from channels where id = cid;
$$;

-- ---------- New user → profile ----------------------------------------

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  base text := regexp_replace(
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
    '[^a-zA-Z0-9_.]', '', 'g');
  uname text;
  colors text[] := array['#2bb3a3','#e8875b','#7c8cf8','#e45f7a','#f2c14e','#5bbf6a','#b47ce8'];
begin
  if char_length(base) < 2 then base := 'user' || base; end if;
  uname := left(base, 32);
  while exists (select 1 from profiles where username = uname) loop
    uname := left(base, 27) || '_' || substr(md5(random()::text), 1, 4);
  end loop;
  -- display_name starts empty so the app shows the (unique) username.
  insert into profiles (id, username, avatar_color)
  values (new.id, uname, colors[1 + floor(random() * array_length(colors, 1))::int]);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Actions (called from the app) ------------------------------

-- Create a server, make the caller its owner, and give it a #general channel.
create function public.create_server(server_name text, color text default '#2bb3a3')
returns uuid language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into servers (name, icon_color, owner_id)
  values (trim(server_name), color, auth.uid()) returning id into sid;
  insert into server_members (server_id, user_id, role) values (sid, auth.uid(), 'owner');
  insert into channels (server_id, name, position) values (sid, 'general', 0);
  return sid;
end;
$$;

-- Join a server using its invite code.
create function public.join_server(code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select id into sid from servers where invite_code = lower(trim(code));
  if sid is null then raise exception 'That invite is invalid or has expired'; end if;
  insert into server_members (server_id, user_id) values (sid, auth.uid())
  on conflict do nothing;
  return sid;
end;
$$;

-- Owner can get a fresh invite code (old one stops working).
create function public.reset_invite(sid uuid)
returns text language plpgsql security definer set search_path = public as $$
declare code text := substr(md5(random()::text), 1, 8);
begin
  if not is_owner(sid) then raise exception 'Only the owner can do that'; end if;
  update servers set invite_code = code where id = sid;
  return code;
end;
$$;

-- ---------- Row Level Security (who can see / change what) -------------

alter table public.profiles       enable row level security;
alter table public.servers        enable row level security;
alter table public.server_members enable row level security;
alter table public.channels       enable row level security;
alter table public.messages       enable row level security;

-- profiles: any signed-in user can see profiles; you can edit only yours
create policy "profiles readable" on public.profiles
  for select to authenticated using (true);
create policy "edit own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- servers: members can see; owner can rename/delete (creation goes through create_server)
create policy "members see server" on public.servers
  for select to authenticated using (is_member(id));
create policy "owner updates server" on public.servers
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner deletes server" on public.servers
  for delete to authenticated using (owner_id = auth.uid());

-- server_members: members see each other; you can leave (owner can't); owner can kick
create policy "members see members" on public.server_members
  for select to authenticated using (is_member(server_id));
create policy "leave or kick" on public.server_members
  for delete to authenticated using (
    (user_id = auth.uid() and role <> 'owner')
    or (is_owner(server_id) and user_id <> auth.uid())
  );

-- channels: members see; owner manages
create policy "members see channels" on public.channels
  for select to authenticated using (is_member(server_id));
create policy "owner creates channels" on public.channels
  for insert to authenticated with check (is_owner(server_id));
create policy "owner updates channels" on public.channels
  for update to authenticated using (is_owner(server_id)) with check (is_owner(server_id));
create policy "owner deletes channels" on public.channels
  for delete to authenticated using (is_owner(server_id));

-- messages: members read & post; authors edit; authors or owner delete
create policy "members read messages" on public.messages
  for select to authenticated using (is_member(channel_server(channel_id)));
create policy "members post messages" on public.messages
  for insert to authenticated with check (
    author_id = auth.uid() and is_member(channel_server(channel_id))
  );
create policy "authors edit messages" on public.messages
  for update to authenticated using (author_id = auth.uid()) with check (author_id = auth.uid());
create policy "authors or owner delete messages" on public.messages
  for delete to authenticated using (
    author_id = auth.uid() or is_owner(channel_server(channel_id))
  );

-- Only content can be edited, and editing stamps edited_at.
create function public.stamp_edit() returns trigger language plpgsql as $$
begin
  new.channel_id := old.channel_id;
  new.author_id  := old.author_id;
  new.created_at := old.created_at;
  new.edited_at  := now();
  return new;
end;
$$;
create trigger messages_stamp_edit before update on public.messages
  for each row execute function public.stamp_edit();

-- Owner can't hand off ownership by editing the row directly, and invite
-- codes only change through reset_invite.
create function public.lock_server_fields() returns trigger language plpgsql as $$
begin
  new.owner_id    := old.owner_id;
  -- Inside reset_invite (security definer) current_user is the function
  -- owner, so only that path can change the code.
  new.invite_code := case when current_user in ('authenticated', 'anon')
                          then old.invite_code else new.invite_code end;
  return new;
end;
$$;
create trigger servers_lock_fields before update on public.servers
  for each row execute function public.lock_server_fields();

-- ---------- Realtime (live updates) -----------------------------------

-- Deletes need the full old row so the app knows which channel it was in.
alter table public.messages replica identity full;
alter table public.channels replica identity full;
alter table public.server_members replica identity full;

alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.channels;
alter publication supabase_realtime add table public.server_members;
alter publication supabase_realtime add table public.servers;
alter publication supabase_realtime add table public.profiles;
