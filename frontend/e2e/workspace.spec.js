import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";

const apiUrl = "http://127.0.0.1:5001/api/v1";

async function register(page, name, email) {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Create an account" })).toBeVisible();
  await page.getByRole("button", { name: "Create an account" }).click();
  const responsePromise = page.waitForResponse((response) =>
    response.url() === `${apiUrl}/auth/register` && response.request().method() === "POST"
  );
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill("SprintSpace-E2E-Password-2026");
  await page.getByRole("button", { name: "Create account" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(201);
  await expect(page.getByText(new RegExp(`Good morning, ${name.split(" ")[0]}`))).toBeVisible();
  return response.json();
}

test("complete workspace collaboration journey", async ({ browser, page, request }) => {
  const suffix = randomUUID().slice(0, 8);
  const adminName = "E2E Admin";
  const developerName = "E2E Developer";
  const adminEmail = `admin-${suffix}@example.test`;
  const developerEmail = `developer-${suffix}@example.test`;
  const projectName = `E2E Project ${suffix}`;
  const taskTitle = `E2E Task ${suffix}`;
  const commentText = `E2E comment ${suffix}`;

  const adminAccount = await register(page, adminName, adminEmail);
  expect(adminAccount.workspace.role).toBe("Admin");

  const cookies = await page.context().cookies();
  const refreshCookie = cookies.find((cookie) => cookie.name === "refreshToken");
  expect(refreshCookie?.httpOnly).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem("accessToken"))).toBeNull();

  await page.getByRole("button", { name: "Create new project" }).click();
  await page.getByLabel("Project name").fill(projectName);
  await page.getByLabel("Description (optional)").fill("Created by the automated end-to-end journey.");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByText(projectName, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Team", exact: true }).click();
  await page.getByPlaceholder("teammate@company.com").fill(developerEmail);
  await page.locator(".team-panel").filter({
    has: page.getByRole("heading", { name: "Invite a teammate" })
  }).locator("select").selectOption("Developer");
  await page.getByRole("button", { name: "Create invite" }).click();
  const inviteToken = await page.locator(".invite-token code").textContent();
  expect(inviteToken).toBeTruthy();

  const developerContext = await browser.newContext();
  try {
    const developerPage = await developerContext.newPage();
    const developerAccount = await register(developerPage, developerName, developerEmail);

    await developerPage.getByRole("button", { name: "Team", exact: true }).click();
    await developerPage.getByPlaceholder("Paste invitation token").fill(inviteToken.trim());
    await developerPage.getByRole("button", { name: "Accept invite" }).click();
    await expect(developerPage.getByText("Invitation accepted. Workspace switched successfully.")).toBeVisible();
    await expect(developerPage.getByText(adminAccount.workspace.name, { exact: true })).toBeVisible();

    // Workspace role and membership must be reflected in the UI and enforced by the API.
    await expect(developerPage.getByText("2 active workspace members")).toBeVisible();
    await developerPage.getByRole("button", { name: "Overview", exact: true }).click();
    await expect(developerPage.getByRole("button", { name: "Create new project" })).toHaveCount(0);
    const forbiddenProject = await request.post(
      `${apiUrl}/workspaces/${adminAccount.workspace.id}/projects`,
      {
        headers: { Authorization: `Bearer ${developerAccount.accessToken}` },
        data: { name: "Developer must not create this project" }
      }
    );
    expect(forbiddenProject.status()).toBe(403);

    // The admin creates a project task and assigns it to the newly joined developer.
    await expect(page.getByText(developerName, { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Overview", exact: true }).click();
    await page.getByRole("button", { name: /New task/ }).click();
    await page.getByLabel("Task title").fill(taskTitle);
    await page.getByLabel("Project").selectOption({ label: projectName });
    const assignee = page.getByLabel("Assign to developer");
    await expect(assignee.locator("option", { hasText: developerName })).toBeAttached();
    await assignee.selectOption({ label: developerName });
    const createdTaskResponse = page.waitForResponse((response) =>
      response.url() === `${apiUrl}/workspaces/${adminAccount.workspace.id}/tasks` &&
      response.request().method() === "POST"
    );
    await page.getByRole("button", { name: "Create task" }).click();
    const taskResponse = await createdTaskResponse;
    expect(taskResponse.status()).toBe(201);
    const taskPayload = await taskResponse.json();
    const taskId = taskPayload.task._id;
    await expect(page.getByRole("button", { name: taskTitle, exact: true })).toBeVisible();

    // The developer receives the task and the assignment notification in the joined workspace.
    await expect(developerPage.getByRole("button", { name: taskTitle, exact: true })).toBeVisible();
    await developerPage.getByRole("button", { name: "Notifications" }).click();
    await expect(developerPage.getByText("You were assigned a task")).toBeVisible();
    const assignmentNotification = developerPage.locator(".notification-item").filter({
      hasText: "You were assigned a task"
    });
    await assignmentNotification.click();
    await expect(assignmentNotification).toHaveClass(/read/);

    // Opening the notification navigates directly to the task discussion.
    await developerPage.getByPlaceholder("Write a comment…").fill(commentText);
    await developerPage.getByRole("button", { name: /Send comment/ }).click();
    await expect(developerPage.getByText(commentText, { exact: true })).toBeVisible();
    await developerPage.getByLabel("Status").selectOption("In progress");
    await developerPage.getByRole("button", { name: "Save task details" }).click();

    await developerPage.getByRole("button", { name: "Close comments" }).click();
    await developerPage.reload();
    await expect(developerPage.getByRole("button", { name: taskTitle, exact: true })).toBeVisible();
    const taskRow = developerPage.locator(".task-table-row").filter({
      has: developerPage.getByRole("button", { name: taskTitle, exact: true })
    });
    await expect(taskRow.locator(".status-pill")).toHaveText("In progress");

    // The sidebar resize control is keyboard-operable and persists its new width.
    const resizeHandle = page.getByRole("button", { name: "Resize sidebar" });
    const initialWidth = Number(await resizeHandle.getAttribute("aria-valuenow"));
    await resizeHandle.press("ArrowRight");
    await expect(resizeHandle).toHaveAttribute("aria-valuenow", String(initialWidth + 12));
    expect(await page.evaluate(() => localStorage.getItem("sprintspace.sidebarWidth"))).toBe(String(initialWidth + 12));

    // Switching to the developer's personal workspace must not leak the invited workspace's project.
    await developerPage.locator(".workspace-switch").click();
    await developerPage.getByRole("button", { name: new RegExp(`${developerName}'s workspace`) }).click();
    await expect(developerPage.locator(".workspace-switch")).toContainText(`${developerName}'s workspace`);
    await expect(developerPage.getByText(projectName, { exact: true })).toHaveCount(0);

    await developerPage.locator(".workspace-switch").click();
    await developerPage.getByRole("button", { name: new RegExp(adminAccount.workspace.name) }).click();
    await expect(developerPage.getByRole("button", { name: taskTitle, exact: true })).toBeVisible();

    // Sign-out must invalidate the refresh cookie; a fresh sign-in must restore the session.
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    await page.getByLabel("Work email").fill(adminEmail);
    await page.getByLabel("Password", { exact: true }).fill("SprintSpace-E2E-Password-2026");
    const loginResponsePromise = page.waitForResponse((response) =>
      response.url() === `${apiUrl}/auth/login` && response.request().method() === "POST"
    );
    await page.getByRole("button", { name: "Sign in" }).click();
    const loginResponse = await loginResponsePromise;
    expect(loginResponse.status()).toBe(200);
    await expect(page.getByText(new RegExp(`Good morning, ${adminName.split(" ")[0]}`))).toBeVisible();
  } finally {
    await developerContext.close();
  }
});
