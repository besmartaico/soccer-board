# Team Board — Integration Guide

This document explains how to build an external application that integrates with Team Board (this repo, deployed at `team.besmartai.co`). It is written for the developer of a separate app who needs to display a user's Team Board data — teams, boards, rosters — inside their own UI.

## TL;DR

- **Auth**: shared Supabase project. The other app authenticates against the **same Supabase URL and anon key** as Team Board. A user signed into either app is signed into both, because the JWT issuer is the same.
- **User identity**: email is the join key. The same email = the same user across both apps.
- **Team membership lives in Team Board**: this app owns the `teams` and `team_members` tables. The other app does **not** create or modify team membership. It just calls the Team Board API with the user's bearer token, and Team Board responds with whatever teams that user has access to.
- **API surface**: a small set of REST endpoints under `https://team.besmartai.co/api/...`. Pass the user's Supabase JWT as `Authorization: Bearer <jwt>`. The user gets back exactly the teams + boards they're allowed to see.

---

## Architecture

```
   +-------------+                          +--------------+
   |  Other App  |                          |  Team Board  |
   |             |                          | (this repo)  |
   +------+------+                          +------+-------+
          |                                        |
          | both apps point at the SAME Supabase   |
          |                                        |
          v                                        v
       +-----------------------------------------------+
       |              Supabase Project                 |
       |  auth.users  |  teams  |  team_members | ...  |
       +-----------------------------------------------+
```

- A user signs in once (in either app) — Supabase issues a JWT for them.
- The other app stores that JWT (Supabase SDK handles this automatically when you use `createBrowserClient` with the same URL + anon key).
- When the other app needs Team Board data, it calls a Team Board API endpoint with `Authorization: Bearer <jwt>`.
- Team Board validates the JWT against the same Supabase project, looks up the user's `team_members` rows, and returns the teams/boards that user is allowed to see.

Team Board has **no awareness** of the other app. It just sees a bearer token and answers normally. This is the cleanest possible integration because there's no token exchange, no shared secret, and no synchronization to maintain.

---

## Setup checklist for the other app

1. **Use the same Supabase project**. Get these env vars from Team Board's Vercel project (or from the Supabase dashboard):

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
   ```

   These are the **only** auth-related secrets the other app needs. Do **not** copy `SUPABASE_SERVICE_ROLE_KEY` — that one stays in Team Board.

2. **Install the Supabase client** (or whatever auth SDK matches the other app's stack):

   ```bash
   npm install @supabase/supabase-js @supabase/ssr
   ```

3. **Create a browser client** the same way Team Board does:

   ```ts
   // other-app/lib/supabaseClient.ts
   import { createBrowserClient } from "@supabase/ssr";

   export const supabase = createBrowserClient(
     process.env.NEXT_PUBLIC_SUPABASE_URL!,
     process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
   );
   ```

4. **Sign users in**. Supabase Auth (email + password, magic link, or OAuth) — same as Team Board. Because the project is shared, the session works in both apps automatically.

5. **Provisioning**: a user must already exist in Team Board's `allowed_users` table (or be invited) before they can sign in. If the other app needs to onboard new users:
   - Easiest: an admin adds the email to `allowed_users` in Team Board's admin panel (`/app/admin/users`).
   - Or: extend the other app to call Team Board's `/api/auth/request-access` endpoint so a Team Board admin can approve from `/app/admin/requests`.

6. **Getting the JWT for API calls**:

   ```ts
   const { data: { session } } = await supabase.auth.getSession();
   const jwt = session?.access_token;

   const res = await fetch("https://team.besmartai.co/api/teams", {
     headers: { Authorization: `Bearer ${jwt}` },
   });
   const { teams, user } = await res.json();
   ```

---

## Team membership model

Team Board is the system of record for who's on what team. The model is:

- `teams(id, name, created_at)` — a team is just a named container.
- `team_members(team_id, user_id, role)` — a user's role on a specific team. `role` is one of:
  - `admin` — full control, including managing members
  - `editor` — can create/edit/delete boards, rosters, board names
  - `viewer` — read-only

The other app cannot grant or revoke team membership through the public API. Membership changes happen inside Team Board's admin UI (or via direct admin SQL). The other app simply **inherits whatever access Team Board says the user has**.

This means:
- If the user has access to Team A and Team B in Team Board, calling `GET /api/teams` from the other app returns both teams.
- If the user has no team membership, the call returns an empty list — the other app should show a "you have no teams yet, ask an admin to add you" message.
- Roles map identically across both apps. If the other app shows an "Edit" button, gate it on `role === "admin" || role === "editor"`.

---

## API reference

All endpoints are under `https://team.besmartai.co`. All require:

```
Authorization: Bearer <supabase_jwt>
Content-Type: application/json   (for POST/PATCH)
```

The bearer token is the user's Supabase access token. Team Board validates it on every request — there is no separate API key.

### `GET /api/teams` — list teams the user belongs to

**Response 200**:
```json
{
  "user": { "id": "uuid", "email": "alice@example.com" },
  "teams": [
    {
      "id": "team-uuid-1",
      "name": "Lone Peak Soccer",
      "created_at": "2026-04-01T00:00:00.000Z",
      "role": "admin"
    },
    {
      "id": "team-uuid-2",
      "name": "Another Org",
      "created_at": "2026-05-01T00:00:00.000Z",
      "role": "viewer"
    }
  ]
}
```

Use this as your starting point — call it on app load to figure out which teams to show the user.

### `GET /api/teams/{teamId}/boards` — list boards for a team

**Response 200**:
```json
{
  "success": true,
  "role": "editor",
  "boards": [
    {
      "id": "board-uuid",
      "name": "Varsity Starting XI",
      "created_at": "2026-04-15T00:00:00.000Z",
      "data": { "htmlBoard": { "placedPlayers": [], "objects": [] } }
    }
  ]
}
```

The `data` field contains the full board state (placed players, lanes, notes, etc.). Schema is stable for the `htmlBoard` object — you can render or summarize it in the other app's UI.

Returns 403 if the user isn't a member of the team.

### `GET /api/teams/{teamId}/roster` — list the team's player roster

**Response 200**:
```json
{
  "success": true,
  "roster": [
    {
      "id": "row-uuid",
      "external_id": "player-123",
      "name": "Jane Doe",
      "picture_url": "https://...",
      "jersey_number": "9",
      "extra": { "position": "forward", "grade": 11 }
    }
  ]
}
```

### `GET /api/boards/{boardId}` — full board data

**Response 200**:
```json
{
  "success": true,
  "board": {
    "id": "board-uuid",
    "team_id": "team-uuid",
    "name": "Varsity Starting XI",
    "data": { ... },
    "created_at": "...",
    "created_by": "user-uuid"
  }
}
```

### `PATCH /api/boards/{boardId}` — rename or update board data

Body: `{ "name": "new name" }` or `{ "data": { ... } }` or both.
Requires `role === "admin" || role === "editor"`.

### `PATCH /api/teams/{teamId}` — rename a team

Body: `{ "name": "new name" }`. Requires editor or admin.

### Other available endpoints

- `POST /api/boards/{boardId}/duplicate` — duplicate a board (editor/admin)
- `POST /api/boards/{boardId}/share-link` — generate a public read-only share link
- `PATCH /api/teams/{teamId}/board-order` — save the user's preferred board ordering
- `POST /api/teams/{teamId}/roster` — replace the team roster (editor/admin)
- `POST /api/teams/members` — invite a member to a team (admin only)

---

## Error responses

All endpoints return JSON. Errors use HTTP status codes:

| Code | Meaning |
|------|---------|
| 401 | Missing or invalid bearer token |
| 403 | User is authenticated but not a member of the team / lacks the required role |
| 404 | Resource doesn't exist |
| 400 | Bad request body |
| 500 | Server-side error (check Vercel logs) |

Error body shape:
```json
{ "success": false, "error": "Human-readable message" }
```

---

## RBAC mapping (for the other app's UI)

Mirror Team Board's role gates in the other app so the UX stays consistent:

```ts
const canEdit = role === "admin" || role === "editor";
const canManageMembers = role === "admin";
```

Hide or disable buttons that require editor/admin if the user is a viewer. The Team Board API will still reject unauthorized writes with 403, but failing on the server creates a worse UX than not showing the button at all.

---

## Worked example — rendering a user's teams and boards in the other app

```ts
import { supabase } from "@/lib/supabaseClient";

const API = "https://team.besmartai.co";

async function loadTeamBoardData() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not signed in");
  const headers = { Authorization: `Bearer ${session.access_token}` };

  // 1. Get the user's teams
  const teamsRes = await fetch(`${API}/api/teams`, { headers });
  const { teams, user } = await teamsRes.json();

  // 2. For each team, get its boards
  const teamsWithBoards = await Promise.all(
    teams.map(async (t) => {
      const r = await fetch(`${API}/api/teams/${t.id}/boards`, { headers });
      const { boards, role } = await r.json();
      return { ...t, role, boards };
    })
  );

  return { user, teams: teamsWithBoards };
}
```

---

## Deep-linking back into Team Board

For UX flows where the other app wants to hand off to Team Board (e.g. clicking a board takes the user to the live editor in Team Board), use these URL patterns:

- Boards page for a team: `https://team.besmartai.co/app/boards?teamId={teamId}`
- A specific board: `https://team.besmartai.co/app/boards/{boardId}`
- Public share view (no login required): `https://team.besmartai.co/share/{shareToken}`

If the user is already signed in (same Supabase project = same cookie), they'll land directly in the editor with no re-auth.

---

## CORS

Team Board's API routes are served from the same domain as the website (`team.besmartai.co`). If the other app is served from a different origin, you'll need to add a CORS layer. The simplest approach is to:

1. Add an `OPTIONS` handler and `Access-Control-Allow-Origin` header to each route, OR
2. Use Next.js middleware to set CORS headers globally, OR
3. Proxy the requests through the other app's own backend.

Option 3 is the most secure (no CORS exposure at all) and the recommended path for production. Talk to the Team Board maintainer if you need option 1 or 2 enabled.

---

## What lives where (summary)

| Concern | Where it's handled |
|---------|--------------------|
| Sign-up / sign-in | Supabase Auth (shared) |
| Email → user identity | Supabase (one user per email) |
| Who can sign up at all | Team Board: `allowed_users` table + admin panel |
| Team creation | Team Board (manual / SQL today) |
| Team membership & roles | Team Board: `team_members` table |
| Boards, rosters, sharing | Team Board API |
| Reading + displaying that data | Other app, via the API in this doc |
| Modifying team membership | Team Board admin panel only |

---

## Future endpoints to consider

These don't exist yet but would be straightforward to add if the other app needs them:

- `POST /api/teams` — create a new team (admin or any user, depending on policy)
- `PATCH /api/teams/{teamId}/members/{userId}` — change a member's role
- `DELETE /api/teams/{teamId}/members/{userId}` — remove a member
- `GET /api/me` — current user metadata across all teams in one call

Open an issue or PR against this repo when you need any of these.
