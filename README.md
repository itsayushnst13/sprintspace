# SprintSpace

A multi-tenant team collaboration and project management platform.

> **Status:** Initial foundation. Features are being delivered incrementally; see the roadmap below. This repository does not yet represent a production-ready SaaS.

## Product direction

SprintSpace brings workspaces, projects, tasks, team collaboration, and operational visibility into one focused workspace.

### Planned capabilities

- Workspace-based multi-tenancy with Admin, Manager, and Member permissions
- Authentication with short-lived access tokens and rotating refresh sessions
- Project and task management with Kanban workflows
- Comments, activity history, and notifications
- Real-time workspace updates
- Analytics backed by actual project and task data
- Redis caching and API rate limiting

## Architecture

A **modular monolith** keeps deployment and development approachable while maintaining clear domain boundaries.

- **Frontend:** React, Vite, TypeScript, Tailwind CSS
- **API:** Node.js, Express, TypeScript
- **Database:** MongoDB with Mongoose
- **Cache / rate limits:** Redis
- **Realtime:** Socket.IO
- **Validation:** Zod
- **Local infrastructure:** Docker Compose

## Repository layout

```text
sprintspace/
├── frontend/       # React application
├── backend/        # Express API
├── docs/           # Architecture and engineering notes
├── docker-compose.yml
└── README.md
```

## Local development

Prerequisites: Node.js 20+, npm, and Docker Desktop.

1. Clone the repository:

   ```bash
   git clone https://github.com/itsayushnst13/sprintspace.git
   cd sprintspace
   ```

2. Copy the example environment files (once the backend/frontend setup files are present):

   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   ```

3. Start local infrastructure:

   ```bash
   docker compose up -d
   ```

4. Install dependencies and start the API and frontend using the scripts documented in their respective folders.

Never commit real credentials, access tokens, private keys, or local `.env` files.

## Security principles

- Every workspace-scoped operation must verify the authenticated user's membership in that workspace.
- Authorization is evaluated on the server; hiding a button is not access control.
- Workspace roles are scoped to workspace membership, not global user records.
- Refresh tokens are stored as hashes and rotated on use.
- Request bodies and identifiers are validated at API boundaries.
- Secrets are provided through environment variables.

## Roadmap

- [ ] App foundation, tooling, and responsive design system
- [ ] Authentication and session lifecycle
- [ ] Workspaces and membership-based authorization
- [ ] Projects and task workflows
- [ ] Team management and invitations
- [ ] Comments, activity feed, and notifications
- [ ] Realtime updates and analytics
- [ ] Integration tests, security review, and deployment guide

## License

License to be selected.
