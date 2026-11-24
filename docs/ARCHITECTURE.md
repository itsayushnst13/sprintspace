# SprintSpace Architecture

## Architectural style

SprintSpace uses a modular monolith. The frontend and API are independently runnable applications, while backend domains share one deployable Express process. This avoids premature microservice complexity and keeps transactional boundaries visible.

## Domain modules

- Identity: registration, login, refresh, logout, sessions
- Workspaces: workspace lifecycle and membership
- Projects: project lifecycle and project-level views
- Tasks: status, priority, assignment, due dates
- Collaboration: comments and activity records
- Notifications: in-app notification lifecycle
- Analytics: aggregates derived from persisted domain records

## Multi-tenant data access

A workspace is the tenant boundary. Workspace-owned records carry a workspace identifier. A request must:

1. Authenticate the caller.
2. Resolve the requested workspace.
3. Confirm an active membership.
4. Apply the role policy for the action.
5. Scope every read and write query to that workspace.

Never trust a workspace ID, role, or assignee supplied by the browser without verifying it server-side. Never permit a manager to grant an Admin role unless an explicit owner/admin policy allows it.

## Roles

- Admin: workspace configuration and member/role administration.
- Manager: manage projects and work assigned within the workspace; cannot grant Admin.
- Member: collaborate on permitted projects and tasks.

Role checks are based on the membership record for the requested workspace, not a global role property on the user.

## Authentication

Target session model:

- Access JWT: 15-minute lifetime, held in application memory.
- Refresh session: 7-day lifetime, delivered in an HttpOnly, Secure-in-production, SameSite cookie.
- Persist only a hash of the refresh token.
- Rotate refresh tokens on successful refresh and revoke the previous session.
- Hash passwords with bcrypt.

Cookie-based refresh endpoints require appropriate CSRF protections and strict origin configuration before production use.

## Data model direction

Collections: users, workspaces, workspaceMembers, projects, tasks, comments, notifications, activityLogs, refreshSessions.

## Infrastructure

- MongoDB is the source of truth.
- Redis is used for cache entries and rate-limit counters.
- Socket.IO rooms are scoped by workspace after membership authorization.
- Cache invalidation is required after mutations; cached tenant data must always include the workspace identity in its key.

## API conventions

Base path: `/api/v1`.

- Validate request params, query strings, and bodies at the API boundary.
- Return consistent error shapes.
- Use pagination for collection endpoints.
- Do not expose internal stack traces or secrets in production responses.
- Add integration tests for cross-workspace access denial.

## Delivery phases

1. Repository foundation and UI shell.
2. Authentication and workspace isolation.
3. Project and task CRUD.
4. Team membership, comments, and activity.
5. Realtime events, notifications, and analytics.
6. Security review, automated tests, and deployment.
