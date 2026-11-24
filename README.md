# SprintSpace

A multi-tenant team collaboration and project management platform built with React, TypeScript, Express, MongoDB, Redis, and Socket.IO.

## What is implemented

- Responsive React dashboard with signup and login.
- In-memory access-token storage, HttpOnly refresh cookie, automatic access-token renewal, hashed refresh-token persistence, rotation, logout revocation, and reuse detection.
- Workspace-scoped Admin, Manager, and Member authorization.
- MongoDB models and tenant-scoped APIs for workspaces, projects, tasks, comments, activity logs, notifications, and refresh sessions.
- Project and task creation, task detail editing (status, priority, assignee, due date), drag-and-drop Kanban board, and task discussion panel with comments.
- Workspace team screen with member role management, removal, invitation creation/revocation, and invitation acceptance. Activity feed, project portfolio, personal tasks, and deadline calendar screens.
- Database-backed workspace metrics, live project/task lists, notification inbox, and Socket.IO workspace events.
- Dockerfiles for API and frontend, optional full-stack Docker Compose profile, and GitHub Actions CI workflow.

## Known gaps / production hardening

This is an actively developed project, not a fully audited production SaaS. Current limitations include:
- Invitation delivery is manual: no transactional email provider is configured. The UI creates a one-time token to share securely; invitees accept it after signing in with the invited email.
- Richer calendar month/week views, workspace switching, and advanced task filters remain to be built.
- Activity feed API exists; a dedicated activity timeline UI is pending.
- Dashboard productivity score and a few secondary focus widgets are still presentation placeholders.
- Automated tests currently cover token helper behavior and workspace role policy; broader API/integration, refresh reuse, cross-tenant isolation, and Socket.IO tests are required.
- Configure production secrets, HTTPS, managed database/cache, observability, backups, and a full security review before public deployment.

## Stack

| Layer | Technologies |
| --- | --- |
| Frontend | React 18, Vite, TypeScript, Tailwind CSS, TanStack Query, Zustand, Recharts, Socket.IO Client |
| API | Node.js 20, Express, TypeScript, Zod, Socket.IO |
| Persistence | MongoDB, Mongoose |
| Cache / rate limits | Redis, ioredis, express-rate-limit |
| Security | Helmet, CORS allowlist, bcrypt, JWT, hashed rotating refresh sessions |
| Infrastructure | Docker Compose, Dockerfiles, GitHub Actions |

## Requirements

- Node.js 20+
- npm 10+
- Docker Desktop

## Run locally (separate processes)

Clone:

```bash
git clone https://github.com/itsayushnst13/sprintspace.git
cd sprintspace
```

Start MongoDB and Redis:

```bash
docker compose up -d mongo redis
```

Configure backend:

```bash
cp backend/.env.example backend/.env
```

Set `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` to different random values (at least 32 characters). Generate one with:

```bash
openssl rand -hex 32
```

Run API:

```bash
cd backend
npm install
npm run dev
```

API health check: http://localhost:5001/health

In another terminal, run frontend:

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Open http://localhost:5173.

## Run the full stack with Docker

From the repository root:

```bash
docker compose --profile app up --build
```

Open http://localhost:8080. The API health endpoint is http://localhost:5001/health.

The Compose profile uses development-only fallback secrets for local convenience. Do not use those defaults in a public environment. See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## API routes

Base URL: `/api/v1`. Protected workspace routes require `Authorization: Bearer <access-token>`.

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/auth/register` | Create account and initial workspace |
| POST | `/auth/login` | Authenticate and create refresh session |
| POST | `/auth/refresh` | Rotate refresh token and issue access token |
| POST | `/auth/logout` | Revoke refresh session |
| GET / POST | `/workspaces` | List memberships / create workspace |
| GET / POST | `/workspaces/:workspaceId/projects` | List / create projects |
| PATCH / DELETE | `/workspaces/:workspaceId/projects/:projectId` | Update / archive project |
| GET / POST | `/workspaces/:workspaceId/tasks` | List / create tasks |
| PATCH / DELETE | `/workspaces/:workspaceId/tasks/:taskId` | Update / delete task |
| GET / POST | `/workspaces/:workspaceId/tasks/:taskId/comments` | List / add task comments |
| DELETE | `/workspaces/:workspaceId/tasks/:taskId/comments/:commentId` | Delete own comment (or Admin) |
| GET | `/workspaces/:workspaceId/activity` | Read activity history |
| GET | `/workspaces/:workspaceId/analytics` | Read workspace metrics |
| GET | `/workspaces/:workspaceId/notifications` | Read personal workspace notifications |
| GET | `/workspaces/:workspaceId/team/members` | List active workspace members |
| GET / POST | `/workspaces/:workspaceId/team/invitations` | List / create pending invitations |
| DELETE | `/workspaces/:workspaceId/team/invitations/:invitationId` | Revoke a pending invitation |
| PATCH / DELETE | `/workspaces/:workspaceId/team/members/:memberId` | Change role / remove member |
| POST | `/invitations/accept` | Accept an invitation using its one-time token |
| PATCH | `/workspaces/:workspaceId/notifications/:notificationId/read` | Mark notification as read |

## Realtime events

Socket.IO authenticates the access token during connection. Clients must emit `workspace:join` with a workspace ID; the server verifies active membership before joining the room. Events include task create/update/delete, project create/update, comment create/delete, and notification creation.

## Security and tenancy

- Workspace roles live on membership records, not on global user records.
- Every protected workspace route checks active membership.
- Project/task/comment queries are scoped to the authorized workspace.
- Assignees must be active members of the same workspace.
- Managers cannot grant Admin; project archiving requires Admin.
- Refresh tokens are random opaque values; only SHA-256 hashes are persisted. Rotation revokes the old session, and reuse detection revokes remaining active sessions.
- Refresh/logout requests require the configured frontend Origin; refresh cookies are HttpOnly and SameSite Strict.
- Request schemas are validated with Zod; Helmet, CORS allowlist, JSON size limit, and API rate limiting are enabled.

Before production, add CSRF/security tests for the exact hosting topology, broader tenant-isolation tests, login-specific brute-force controls, account recovery, email invitation delivery, monitoring, and a full security review.

## Development commands

Backend (from `backend/`): `npm run dev`, `npm run typecheck`, `npm test`, `npm run build`.

Frontend (from `frontend/`): `npm run dev`, `npm run typecheck`, `npm run build`.

GitHub Actions runs backend typecheck/tests/build and frontend build on pushes and pull requests to `main`.

Never commit real credentials or local `.env` files. Use the provided `.env.example` templates.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## License

A license has not yet been selected.
