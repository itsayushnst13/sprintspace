# SprintSpace Manual Smoke Test

Use this checklist after starting the application. These are manual runtime checks; CI typecheck/build success does not replace them.

## 1. Local services

- [ ] Open the frontend at http://localhost:8080.
- [ ] Confirm API liveness at http://localhost:5001/health.
- [ ] Confirm dependency readiness at http://localhost:5001/ready.
- [ ] Confirm MongoDB and Redis containers are healthy with `docker compose ps`.

## 2. Authentication and sessions

- [ ] Register a new account with a unique email and a password of at least 10 characters.
- [ ] Confirm a new workspace is created and the user is its Admin.
- [ ] Refresh the browser. The session should restore using the HttpOnly refresh cookie.
- [ ] Sign out and sign back in.
- [ ] Sign in from a second browser/private window with a different account.
- [ ] Confirm passwords never appear in API responses or browser storage.
- [ ] In browser developer tools, confirm the refresh cookie is HttpOnly and the access token is not persisted in localStorage.

## 3. Workspace isolation

- [ ] Create a second workspace from the workspace switcher.
- [ ] Create a project and tasks in workspace A.
- [ ] Switch to workspace B and confirm workspace A projects/tasks are not shown.
- [ ] Use account B, which is not a member of workspace A, and confirm workspace A API requests return 404.
- [ ] Invite account B to workspace A and accept the token while signed in with the invited email.
- [ ] Confirm account B can access workspace A only after invitation acceptance.
- [ ] Remove account B from workspace A. Its active socket should leave the workspace room and the client should switch to another accessible workspace or sign out.

## 4. Projects and tasks

- [ ] As Admin, create a project.
- [ ] As Manager, create and edit a project.
- [ ] As Member, confirm project creation/edit controls are unavailable and API requests are forbidden.
- [ ] Create tasks with each priority and each workflow status.
- [ ] Assign a task to another active workspace member.
- [ ] Move tasks across Kanban columns and confirm the change persists after refresh.
- [ ] As an assignee, confirm status can be changed but title, priority, due date, and assignee cannot.
- [ ] As a task creator or Manager/Admin, edit task details.
- [ ] As Manager/Admin, delete a task and confirm its comments and task notifications are removed.
- [ ] Use status, priority, and project filters on the dashboard task list.

## 5. Collaboration and notifications

- [ ] Add a comment to a task.
- [ ] Confirm the task assignee receives a notification.
- [ ] Mark the notification as read and confirm the unread count changes.
- [ ] Open the Activity page and confirm project, task, comment, and membership events appear.
- [ ] Open the same workspace in two browsers and confirm changes trigger realtime refreshes.

## 6. Calendar and analytics

- [ ] Add due dates to tasks.
- [ ] Open Calendar and navigate to previous month, current month, and next month.
- [ ] Confirm task chips appear on the matching dates and open the task editor.
- [ ] Change task status and confirm analytics update after cache invalidation.
- [ ] Temporarily stop Redis in local development and confirm analytics still fall back to MongoDB.

## 7. Security checks

- [ ] Try refreshing/logging out from a disallowed Origin; the API should reject the request.
- [ ] Confirm login and registration reject requests from a disallowed Origin.
- [ ] Reuse an already rotated refresh token; the server should revoke active refresh sessions for that user.
- [ ] Confirm a Member cannot archive projects or delete tasks.
- [ ] Confirm an unrelated workspace member cannot edit another user's task.
- [ ] Confirm malformed JSON and invalid Mongo IDs return client errors rather than generic 500 responses.

## Completion criteria

Do not call the app production-ready until the above checks pass in the target deployment topology, integration tests cover the security-critical cases, and a security review plus backup/restore drill are complete.
