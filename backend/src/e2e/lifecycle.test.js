import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { app } from "../app.js";
import { env } from "../config/env.js";
import { redis } from "../config/database.js";

function getRefreshCookie(response) {
  const cookies = typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie")].filter(Boolean);
  const cookie = cookies.find((value) => value.startsWith("refreshToken="));
  return cookie ? cookie.split(";")[0] : null;
}

async function request(baseUrl, path, options = {}) {
  const headers = new Headers({ Origin: options.origin ?? env.CLIENT_URL });
  if (options.token) headers.set("Authorization", "Bearer " + options.token);
  if (options.cookie) headers.set("Cookie", options.cookie);
  let body;
  if (options.rawBody !== undefined) {
    headers.set("Content-Type", "application/json");
    body = options.rawBody;
  } else if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(options.body);
  }
  const response = await fetch(baseUrl + path, {
    method: options.method ?? "GET",
    headers,
    body
  });
  const data = response.status === 204 ? null : await response.json();
  return { status: response.status, data, cookie: getRefreshCookie(response) };
}

test("complete workspace collaboration lifecycle and security boundaries", { timeout: 60000 }, async () => {
  await mongoose.connect(env.MONGODB_URI);
  await redis.connect();
  await mongoose.connection.dropDatabase();
  await Promise.all(Object.values(mongoose.connection.models).map((model) => model.syncIndexes()));

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const rootUrl = "http://127.0.0.1:" + address.port;
  const baseUrl = rootUrl + "/api/v1";

  try {
    const health = await request(rootUrl, "/health");
    assert.equal(health.status, 200);
    const ready = await request(rootUrl, "/ready");
    assert.equal(ready.status, 200);

    const missingAuth = await request(baseUrl, "/workspaces");
    assert.equal(missingAuth.status, 401);

    const suffix = randomUUID();
    const adminEmail = "admin-" + suffix + "@example.test";
    const developerEmail = "developer-" + suffix + "@example.test";
    const outsiderEmail = "outsider-" + suffix + "@example.test";
    const password = "SprintSpace-E2E-Password-123!";

    const blockedRegistration = await request(baseUrl, "/auth/register", {
      method: "POST",
      origin: "https://untrusted.example",
      body: { name: "Blocked User", email: "blocked-" + suffix + "@example.test", password }
    });
    assert.equal(blockedRegistration.status, 403);
    assert.equal(blockedRegistration.data.error.code, "UNTRUSTED_ORIGIN");

    const admin = await request(baseUrl, "/auth/register", {
      method: "POST",
      body: { name: "E2E Admin", email: adminEmail, password }
    });
    assert.equal(admin.status, 201, JSON.stringify(admin.data));
    assert.ok(admin.cookie, "registration must set a refresh cookie");
    assert.equal(admin.data.workspace.role, "Admin");
    assert.equal(admin.data.user.email, adminEmail);
    assert.equal(Object.hasOwn(admin.data.user, "passwordHash"), false);

    const malformedJson = await request(baseUrl, "/workspaces", {
      method: "POST",
      token: admin.data.accessToken,
      rawBody: "{"
    });
    assert.equal(malformedJson.status, 400);
    assert.equal(malformedJson.data.error.code, "INVALID_JSON");

    const duplicate = await request(baseUrl, "/auth/register", {
      method: "POST",
      body: { name: "Duplicate User", email: adminEmail, password }
    });
    assert.equal(duplicate.status, 409);

    const adminLogin = await request(baseUrl, "/auth/login", {
      method: "POST",
      body: { email: adminEmail, password }
    });
    assert.equal(adminLogin.status, 200);
    assert.equal(adminLogin.data.user.id, admin.data.user.id);
    const workspaceId = admin.data.workspace.id;

    const project = await request(baseUrl, "/workspaces/" + workspaceId + "/projects", {
      method: "POST",
      token: admin.data.accessToken,
      body: { name: "E2E Product Launch", description: "End-to-end project verification" }
    });
    assert.equal(project.status, 201, JSON.stringify(project.data));
    const projectId = project.data.project._id;

    const invalidProjectId = await request(baseUrl, "/workspaces/" + workspaceId + "/projects/not-an-object-id", {
      method: "PATCH",
      token: admin.data.accessToken,
      body: { name: "Changed name" }
    });
    assert.equal(invalidProjectId.status, 400);
    assert.equal(invalidProjectId.data.error.code, "INVALID_ID");

    const projects = await request(baseUrl, "/workspaces/" + workspaceId + "/projects", {
      token: admin.data.accessToken
    });
    assert.equal(projects.status, 200);
    assert.equal(projects.data.projects.length, 1);
    assert.equal(projects.data.projects[0].createdBy.name, "E2E Admin");

    const developer = await request(baseUrl, "/auth/register", {
      method: "POST",
      body: { name: "E2E Developer", email: developerEmail, password }
    });
    assert.equal(developer.status, 201, JSON.stringify(developer.data));
    assert.ok(developer.cookie);

    const invite = await request(baseUrl, "/workspaces/" + workspaceId + "/team/invitations", {
      method: "POST",
      token: admin.data.accessToken,
      body: { email: developerEmail, role: "Developer" }
    });
    assert.equal(invite.status, 201, JSON.stringify(invite.data));
    assert.ok(invite.data.inviteToken);

    const accepted = await request(baseUrl, "/invitations/accept", {
      method: "POST",
      token: developer.data.accessToken,
      cookie: developer.cookie,
      body: { token: invite.data.inviteToken }
    });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
    assert.equal(accepted.data.workspaceId, workspaceId);
    assert.equal(accepted.data.role, "Developer");

    const developerWorkspaces = await request(baseUrl, "/workspaces", {
      token: developer.data.accessToken
    });
    const invitedWorkspace = developerWorkspaces.data.workspaces.find((item) => item.id === workspaceId);
    assert.equal(invitedWorkspace.role, "Developer");
    assert.equal(developerWorkspaces.data.workspaces.length, 2);

    const memberList = await request(baseUrl, "/workspaces/" + workspaceId + "/team/members", {
      token: admin.data.accessToken
    });
    assert.equal(memberList.status, 200);
    assert.equal(memberList.data.members.length, 2);
    assert.ok(memberList.data.members.some((member) => member.userId.email === developerEmail));

    const forbiddenInvite = await request(baseUrl, "/workspaces/" + workspaceId + "/team/invitations", {
      method: "POST",
      token: developer.data.accessToken,
      body: { email: "another-" + suffix + "@example.test", role: "Developer" }
    });
    assert.equal(forbiddenInvite.status, 403);

    const unassignedTask = await request(baseUrl, "/workspaces/" + workspaceId + "/tasks", {
      method: "POST",
      token: admin.data.accessToken,
      body: { projectId, title: "Task without owner" }
    });
    assert.equal(unassignedTask.status, 400);
    assert.equal(unassignedTask.data.error.code, "ASSIGNEE_REQUIRED");

    const task = await request(baseUrl, "/workspaces/" + workspaceId + "/tasks", {
      method: "POST",
      token: admin.data.accessToken,
      body: {
        projectId,
        title: "Verify release workflow",
        description: "Exercise create, assign, update and comment flows",
        priority: "High",
        assigneeId: developer.data.user.id
      }
    });
    assert.equal(task.status, 201, JSON.stringify(task.data));
    const taskId = task.data.task._id;
    assert.equal(task.data.task.assigneeId, developer.data.user.id);

    const myTasks = await request(baseUrl, "/workspaces/" + workspaceId + "/tasks?mine=true", {
      token: developer.data.accessToken
    });
    assert.equal(myTasks.status, 200);
    assert.equal(myTasks.data.tasks.length, 1);
    assert.equal(myTasks.data.tasks[0]._id, taskId);

    const developerStatusUpdate = await request(baseUrl, "/workspaces/" + workspaceId + "/tasks/" + taskId, {
      method: "PATCH",
      token: developer.data.accessToken,
      body: { status: "Done" }
    });
    assert.equal(developerStatusUpdate.status, 200, JSON.stringify(developerStatusUpdate.data));
    assert.equal(developerStatusUpdate.data.task.status, "Done");

    const developerDetailEdit = await request(baseUrl, "/workspaces/" + workspaceId + "/tasks/" + taskId, {
      method: "PATCH",
      token: developer.data.accessToken,
      body: { priority: "Low" }
    });
    assert.equal(developerDetailEdit.status, 403);

    const comment = await request(baseUrl, "/workspaces/" + workspaceId + "/tasks/" + taskId + "/comments", {
      method: "POST",
      token: admin.data.accessToken,
      body: { body: "Please verify the completed workflow." }
    });
    assert.equal(comment.status, 201, JSON.stringify(comment.data));

    const comments = await request(baseUrl, "/workspaces/" + workspaceId + "/tasks/" + taskId + "/comments", {
      token: developer.data.accessToken
    });
    assert.equal(comments.status, 200);
    assert.equal(comments.data.comments.length, 1);
    assert.equal(comments.data.comments[0].body, "Please verify the completed workflow.");

    const notifications = await request(baseUrl, "/workspaces/" + workspaceId + "/notifications", {
      token: developer.data.accessToken
    });
    assert.equal(notifications.status, 200);
    assert.equal(notifications.data.unreadCount, 2);
    for (const notification of notifications.data.notifications) {
      const readNotification = await request(baseUrl, "/workspaces/" + workspaceId + "/notifications/" + notification._id + "/read", {
        method: "PATCH",
        token: developer.data.accessToken
      });
      assert.equal(readNotification.status, 200);
    }
    const notificationsAfterRead = await request(baseUrl, "/workspaces/" + workspaceId + "/notifications", {
      token: developer.data.accessToken
    });
    assert.equal(notificationsAfterRead.data.unreadCount, 0);

    const analytics = await request(baseUrl, "/workspaces/" + workspaceId + "/analytics", {
      token: admin.data.accessToken
    });
    assert.equal(analytics.status, 200);
    assert.deepEqual(analytics.data.metrics, {
      projects: 1,
      members: 2,
      tasks: 1,
      completedTasks: 1,
      dueIn24Hours: 0,
      completionRate: 100
    });

    const activity = await request(baseUrl, "/workspaces/" + workspaceId + "/activity", {
      token: admin.data.accessToken
    });
    assert.equal(activity.status, 200);
    assert.ok(activity.data.activity.length >= 4);

    const outsider = await request(baseUrl, "/auth/register", {
      method: "POST",
      body: { name: "E2E Outsider", email: outsiderEmail, password }
    });
    assert.equal(outsider.status, 201);

    const isolatedProjects = await request(baseUrl, "/workspaces/" + workspaceId + "/projects", {
      token: outsider.data.accessToken
    });
    assert.equal(isolatedProjects.status, 404);

    const developerArchive = await request(baseUrl, "/workspaces/" + workspaceId + "/projects/" + projectId, {
      method: "DELETE",
      token: developer.data.accessToken
    });
    assert.equal(developerArchive.status, 403);

    const developerDelete = await request(baseUrl, "/workspaces/" + workspaceId + "/tasks/" + taskId, {
      method: "DELETE",
      token: developer.data.accessToken
    });
    assert.equal(developerDelete.status, 403);

    const adminDelete = await request(baseUrl, "/workspaces/" + workspaceId + "/tasks/" + taskId, {
      method: "DELETE",
      token: admin.data.accessToken
    });
    assert.equal(adminDelete.status, 204);

    const commentsAfterDelete = await request(baseUrl, "/workspaces/" + workspaceId + "/tasks/" + taskId + "/comments", {
      token: admin.data.accessToken
    });
    assert.equal(commentsAfterDelete.status, 404);

    const archivedProject = await request(baseUrl, "/workspaces/" + workspaceId + "/projects/" + projectId, {
      method: "DELETE",
      token: admin.data.accessToken
    });
    assert.equal(archivedProject.status, 200);
    assert.equal(archivedProject.data.project.status, "archived");

    const analyticsAfterArchive = await request(baseUrl, "/workspaces/" + workspaceId + "/analytics", {
      token: admin.data.accessToken
    });
    assert.equal(analyticsAfterArchive.status, 200);
    assert.equal(analyticsAfterArchive.data.metrics.projects, 0);
    assert.equal(analyticsAfterArchive.data.metrics.tasks, 0);

    const firstRefresh = await request(baseUrl, "/auth/refresh", {
      method: "POST",
      cookie: admin.cookie
    });
    assert.equal(firstRefresh.status, 200, JSON.stringify(firstRefresh.data));
    assert.ok(firstRefresh.cookie);

    const replayedRefresh = await request(baseUrl, "/auth/refresh", {
      method: "POST",
      cookie: admin.cookie
    });
    assert.equal(replayedRefresh.status, 401);
    assert.equal(replayedRefresh.data.error.code, "REFRESH_REUSE");

    const invalidatedReplacement = await request(baseUrl, "/auth/refresh", {
      method: "POST",
      cookie: firstRefresh.cookie
    });
    assert.equal(invalidatedReplacement.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await Promise.allSettled([redis.quit(), mongoose.disconnect()]);
  }
});
