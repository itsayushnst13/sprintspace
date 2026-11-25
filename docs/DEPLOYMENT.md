# Deployment Guide

SprintSpace ships with separate production Dockerfiles for the API and frontend. The Compose `app` profile is intended for local full-stack smoke testing, not as a managed production deployment.

## Local full-stack container run

From the repository root:

```bash
docker compose --profile app up --build
```

Open the frontend at http://localhost:8080. The API liveness endpoint is available at http://localhost:5001/health and dependency readiness at http://localhost:5001/ready. Compose binds published ports to host loopback for local development.

To stop:

```bash
docker compose --profile app down
```

To remove local database volumes as well (destructive):

```bash
docker compose --profile app down -v
```

The Compose profile uses development-only fallback secrets for convenience. Never reuse those values outside a local machine.

## Production checklist

Before deploying to a public environment:

1. Set `NODE_ENV=production` and `COOKIE_SECURE=true`.
2. Provide unique, high-entropy `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` values through the deployment secret manager.
3. Set `CLIENT_URL` to the exact HTTPS frontend origin.
4. Use managed MongoDB and Redis with TLS, authentication, backups, and network restrictions.
5. Configure HTTPS termination and secure proxy headers. Set `TRUST_PROXY=true` only when the API is behind a known, trusted reverse proxy; never enable it when clients can reach the API directly.
6. Restrict database/network access to the API service.
7. Configure log collection, uptime monitoring, alerting, and backup restore drills.
8. Run CI and tenant-isolation/security tests before promoting a release.
9. Set explicit resource limits and health checks in the hosting platform.
10. Review cookie, CORS, CSRF, rate-limit, and account recovery behavior for the deployment topology.

## Container images

- `backend/Dockerfile`: checks native JavaScript source files and runs the API directly with Node.js as the non-root `node` user.
- `frontend/Dockerfile`: builds the Vite application and serves the static SPA through Nginx.
- `frontend/nginx.conf`: forwards `/api` and `/socket.io` traffic to the backend.

The frontend build arguments `VITE_API_URL` and `VITE_SOCKET_URL` are public client configuration, not secrets.
