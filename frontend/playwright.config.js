import { defineConfig } from "@playwright/test";

const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: isCI ? 1 : 0,
  reporter: isCI ? "list" : "list",
  timeout: 45000,
  expect: { timeout: 10000 },
  use: {
    baseURL: "http://127.0.0.1:5173",
    browserName: "chromium",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  webServer: [
    {
      command: "npm --prefix ../backend start",
      url: "http://127.0.0.1:5001/health",
      reuseExistingServer: !isCI,
      timeout: 120_000,
      env: {
        NODE_ENV: "test",
        PORT: "5001",
        CLIENT_URL: "http://127.0.0.1:5173",
        MONGODB_URI: process.env.MONGODB_URI ?? "mongodb://127.0.0.1:27017/sprintspace_e2e",
        REDIS_URL: process.env.REDIS_URL ?? "redis://127.0.0.1:6379",
        JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET ?? "test-access-secret-012345678901234567890",
        JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET ?? "test-refresh-secret-012345678901234567890"
      }
    },
    {
      command: "npm run dev -- --host 127.0.0.1",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !isCI,
      timeout: 60000,
      env: {
        VITE_API_URL: "http://127.0.0.1:5001/api/v1",
        VITE_SOCKET_URL: "http://127.0.0.1:5001"
      }
    }
  ]
});
