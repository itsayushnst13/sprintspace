import { test, expect } from "@playwright/test";

function uniqueEmail(prefix) {
  return prefix + "-" + Date.now() + "-" + Math.random().toString(16).slice(2) + "@example.test";
}

async function register(page, name, email, password) {
  await page.goto("/");
  await page.getByRole("button", { name: "Create an account", exact: true }).click();
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: /Create account/ }).click();
  await expect(page.getByRole("heading", { name: new RegExp("Good morning, " + name.split(" ")[0]) })).toBeVisible();
}

test("browser journey: register, invite, assign a task, collaborate and update progress", async ({ browser }) => {
  const password = "SprintSpace-E2E-Password-123!";
  const adminName = "Browser Admin";
  const developerName = "Browser Developer";
  const adminEmail = uniqueEmail("browser-admin");
  const developerEmail = uniqueEmail("browser-developer");
  const projectName = "Browser E2E Project";
  const taskTitle = "Browser E2E Assigned Task";
  const browserErrors = [];

  const adminContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  adminPage.on("pageerror", (error) => browserErrors.push("admin: " + error.message));

  const developerContext = await browser.newContext();
  const developerPage = await developerContext.newPage();
  developerPage.on("pageerror", (error) => browserErrors.push("developer: " + error.message));

  try {
    await register(adminPage, adminName, adminEmail, password);

    await adminPage.getByRole("button", { name: "Create new project" }).click();
    const projectModal = adminPage.locator(".create-modal");
    await projectModal.getByLabel("Project name").fill(projectName);
    await projectModal.getByRole("button", { name: /Create project/ }).click();
    await expect(adminPage.getByText(projectName, { exact: true }).first()).toBeVisible();

    await adminPage.getByRole("button", { name: "Team", exact: true }).click();
    await adminPage.getByPlaceholder("teammate@company.com").fill(developerEmail);
    await adminPage.getByRole("button", { name: /Create invite/ }).click();
    const inviteToken = (await adminPage.locator(".invite-token code").textContent())?.trim();
    expect(inviteToken).toBeTruthy();

    await register(developerPage, developerName, developerEmail, password);
    await developerPage.getByRole("button", { name: "Team", exact: true }).click();
    await developerPage.getByPlaceholder("Paste invitation token").fill(inviteToken);
    await developerPage.getByRole("button", { name: /Accept invite/ }).click();
    await expect(developerPage.getByText("Invitation accepted. Workspace switched successfully.")).toBeVisible();

    await adminPage.getByRole("button", { name: "Overview", exact: true }).click();
    await adminPage.getByRole("button", { name: /New task/ }).first().click();
    const taskModal = adminPage.locator(".create-modal");
    await taskModal.getByLabel("Task title").fill(taskTitle);
    const projectSelect = taskModal.locator(".create-form label").filter({ hasText: "Choose a project" }).locator("select");
    await projectSelect.selectOption({ label: projectName });
    const assigneeSelect = taskModal.locator(".create-form label").filter({ hasText: "Choose a developer" }).locator("select");
    await expect(assigneeSelect.locator("option", { hasText: developerName })).toHaveCount(1);
    await assigneeSelect.selectOption({ label: developerName });
    await taskModal.getByRole("button", { name: /Create task/ }).click();
    await expect(adminPage.getByRole("button", { name: taskTitle, exact: true })).toBeVisible();

    await developerPage.getByRole("button", { name: "My tasks", exact: true }).click();
    await expect(developerPage.getByText(taskTitle, { exact: true })).toBeVisible();

    await developerPage.getByRole("button", { name: "Board", exact: true }).click();
    await developerPage.getByRole("button", { name: taskTitle, exact: true }).click();
    const taskDiscussion = developerPage.locator(".comment-modal");
    await expect(taskDiscussion.getByLabel("Status")).toBeVisible();
    await expect(taskDiscussion.getByLabel("Priority")).toHaveCount(0);
    await taskDiscussion.getByLabel("Status").selectOption("Done");
    await taskDiscussion.getByRole("button", { name: "Save task details" }).click();

    await taskDiscussion.getByPlaceholder("Write a comment…").fill("Browser E2E collaboration comment.");
    await taskDiscussion.getByRole("button", { name: /Send comment/ }).click();
    await expect(taskDiscussion.getByText("Browser E2E collaboration comment.")).toBeVisible();

    await developerPage.getByRole("button", { name: "Notifications" }).click();
    await expect(developerPage.getByText("You were assigned a task")).toBeVisible();
    await developerPage.getByRole("button", { name: /You were assigned a task/ }).click();
    await expect(developerPage.getByText("Notifications (1 unread)")).toBeVisible();

    await adminPage.getByRole("button", { name: "Projects", exact: true }).click();
    await expect(adminPage.getByText("100% complete")).toBeVisible();
    await adminPage.getByRole("button", { name: "Open project" }).click();
    await expect(adminPage.getByText(taskTitle, { exact: true })).toBeVisible();

    await adminPage.getByRole("button", { name: "Activity", exact: true }).click();
    await expect(adminPage.getByText(/Created project/)).toBeVisible();
    expect(browserErrors).toEqual([]);
  } finally {
    await Promise.all([adminContext.close(), developerContext.close()]);
  }
});
