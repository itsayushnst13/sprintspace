import test from "node:test";
import assert from "node:assert/strict";
import { canArchiveProjects, canDeleteTasks, canEditTask, canManageProjects } from "../security/permissions.js";

test("only Admin and Manager can create or update projects", () => {
  assert.equal(canManageProjects("Admin"), true);
  assert.equal(canManageProjects("Manager"), true);
  assert.equal(canManageProjects("Member"), false);
  assert.equal(canManageProjects("Developer"), false);
});

test("only Admin can archive projects", () => {
  assert.equal(canArchiveProjects("Admin"), true);
  assert.equal(canArchiveProjects("Manager"), false);
  assert.equal(canArchiveProjects("Member"), false);
});

test("only Admin and Manager can delete tasks", () => {
  assert.equal(canDeleteTasks("Admin"), true);
  assert.equal(canDeleteTasks("Manager"), true);
  assert.equal(canDeleteTasks("Member"), false);
  assert.equal(canDeleteTasks("Developer"), false);
});

test("Developers follow member task permissions", () => {
  assert.equal(canEditTask("Developer", false, true, ["status"]), true);
  assert.equal(canEditTask("Developer", false, true, ["priority"]), false);
  assert.equal(canEditTask("Developer", false, false, ["status"]), false);
});

test("assignees can change status but cannot edit task details", () => {
  assert.equal(canEditTask("Member", false, true, ["status"]), true);
  assert.equal(canEditTask("Member", false, true, ["status", "priority"]), false);
  assert.equal(canEditTask("Member", false, true, ["assigneeId"]), false);
});

test("task creators and workspace managers can edit task details", () => {
  assert.equal(canEditTask("Member", true, false, ["title", "description", "dueDate"]), true);
  assert.equal(canEditTask("Member", true, false, ["assigneeId"]), true);
  assert.equal(canEditTask("Manager", false, false, ["priority", "assigneeId"]), true);
  assert.equal(canEditTask("Admin", false, false, ["title"]), true);
});

test("unrelated members cannot edit tasks", () => {
  assert.equal(canEditTask("Member", false, false, ["status"]), false);
});
