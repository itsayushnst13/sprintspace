import test from "node:test";
import assert from "node:assert/strict";

type Role = "Admin" | "Manager" | "Member";
const canManageProjects = (role: Role) => role === "Admin" || role === "Manager";
const canArchiveProjects = (role: Role) => role === "Admin";
const canDeleteTasks = (role: Role) => role === "Admin" || role === "Manager";

test("only Admin and Manager can manage projects", () => {
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
