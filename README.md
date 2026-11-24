# SprintSpace

A multi-tenant collaboration and project management platform built with React, TypeScript, Express, MongoDB, and Redis.

## Current implementation status

**Implemented:** responsive React dashboard shell, signup/login interface, Express API bootstrap, environment validation, MongoDB/Redis connections, user/workspace/membership/project/task models, workspace membership authorization middleware, and basic tenant-scoped project/task APIs.

**Still in progress:** refresh token hashing and rotation, live frontend project/task integration, invitations, comments, activity feed, notifications, real-time updates, database-backed analytics, automated tests, CI, deployment configuration, and production security review. The dashboard currently displays demo preview metrics and tasks. This is not yet a production-ready SaaS.

## Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS, TanStack Query, Zustand, Recharts
- API: Node.js, Express, TypeScript, Zod
- Data: MongoDB, Mongoose
- Cache / rate limits: Redis, ioredis, express-rate-limit
- Security baseline: Helmet, CORS allowlist, bcrypt, JWT
- Local infrastructure: Docker Compose

## Requirements

Node.js 20+, npm 10+, and Docker Desktop.

## Run locally

Clone the repository:

```bash
git clone https://github.com/itsayushnst13/sprintspace.git
cd sprintspace
```

Start MongoDB and Redis:

```bash
docker compose up -d
```

Configure backend:

```bash
cp backend/.env.example backend/.env
```

Set `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` to different random values (at least 32 characters). Generate a secret with `openssl rand -hex 32`.

Run API in one terminal:

```bash
cd backend
npm install
npm run dev
```

API health check: http://localhost:5001/health

Configure and run frontend in another terminal:

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

Open http://localhost:5173.

## API routes

Base URL: `/api/v1`.

| Method | Route | Purpose |
| --- | --- | --- |
| POST | `/auth/register` | Create user and initial workspace |
| POST | `/auth/login` | Authenticate |
| POST | `/auth/logout` | Clear refresh cookie |
| GET | `/workspaces` | List active memberships |
| POST | `/workspaces` | Create workspace |
| GET | `/workspaces/:workspaceId/projects` | List workspace projects |
| POST | `/workspaces/:workspaceId/projects` | Create project |
| PATCH | `/workspaces/:workspaceId/projects/:projectId` | Update project |
| DELETE | `/workspaces/:workspaceId/projects/:projectId` | Archive project |
| GET | `/workspaces/:workspaceId/tasks` | List workspace tasks |
| POST | `/workspaces/:workspaceId/tasks` | Create task |
| PATCH | `/workspaces/:workspaceId/tasks/:taskId` | Update task |
| DELETE | `/workspaces/:workspaceId/tasks/:taskId` | Delete task |

Protected routes require `Authorization: Bearer <access-token>`.

## Security and tenancy

Workspace roles belong to membership records. Protected workspace routes verify active membership, and project/task queries scope records to the authorized workspace. Task assignment validates the assignee belongs to that same workspace. Admin/Manager restrictions apply to project creation/update and task deletion; workspace archiving requires Admin.

Before production, complete hashed refresh-session persistence and rotation, CSRF controls for cookie-based refresh, login-specific brute-force controls, comprehensive tenant-isolation tests, and a full security review.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for architectural decisions.

## Development commands

Backend: `npm run dev`, `npm run typecheck`, `npm run build`.

Frontend: `npm run dev`, `npm run typecheck`, `npm run build`.

Never commit real credentials or local `.env` files. Use the provided `.env.example` templates.

## License

A license has not yet been selected.
