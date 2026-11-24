import test from "node:test";
import assert from "node:assert/strict";
import { canArchiveProjects, canDeleteTasks, canManageProjects } from "../security/permissions.js";

test("only Admin and Manager can create or update projects", () => {
  assert.equal(canManageProjects("Admin"), true);
  assert.equal(canManageProjects("Manager"), true);
  assert.equal(canManageProjects("Member"), false);
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
});
