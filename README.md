# Cove

A place for your people. Cove is a real-time chat app: create servers, invite friends, and talk in text channels, with live updates.

**Live site:** https://langluaa.github.io/cove/

## Features (v0.1)

- Sign up / log in (email + password)
- Create servers, each with a color icon and a `#general` channel
- Invite friends with a link or code (owners can reset it)
- Text channels: owners create and delete them
- Live chat: messages appear instantly, grouped by person, with day dividers
- Edit and delete your own messages; owners can delete any message
- Member list with online / offline status; owners can kick
- Profiles with display name and color
- Friends: add by username, accept or decline requests, see who's online
- Direct messages with friends or anyone you share a server with, with unread dots
- Works on phones

**Coming next:** roles and permissions, image uploads, reactions, voice.

## Tech

- **Frontend:** React + Vite, hosted on GitHub Pages
- **Backend:** [Supabase](https://supabase.com) (Postgres, auth, realtime)
- Security comes from Postgres Row Level Security, defined in `supabase/schema.sql`

## Setup

### 1. Database (one time)

1. Open your Supabase project → **SQL Editor** → **New query**
2. Paste in all of `supabase/schema.sql` and click **Run**
3. New query again: paste in `supabase/002_friends_dms.sql` and click **Run** (adds friends + DMs)
4. Go to **Authentication → URL Configuration**:
   - **Site URL:** `https://langluaa.github.io/cove/`
   - **Redirect URLs:** add `https://langluaa.github.io/cove/` and `http://localhost:5173/`
5. Optional, for easier testing: **Authentication → Sign In / Providers → Email** → turn off **Confirm email**

### 2. Hosting (one time)

In the GitHub repo: **Settings → Pages → Source → GitHub Actions**.
Every push to `main` then rebuilds and publishes the site automatically.

### 3. Running it on your computer

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

The Supabase URL and anon key are in `src/config.js`. They are meant to be public.
**Never** put the `service_role` key in this repo.
