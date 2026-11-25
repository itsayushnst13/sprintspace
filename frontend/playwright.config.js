import { defineConfig } from "@playwright/test";

const backendEnv = {
  NODE_ENV: "test",
  PORT: "5001",
  CLIENT_URL: "http://127.0.0.1:5173",
  MONGODB_URI: "mongodb://127.0.0.1:27017/sprintspace_e2e",
  REDIS_URL: "redis://127.0.0.1:6380",
  JWT_ACCESS_SECRET: "e2e-access-secret-with-at-least-32-characters",
  JWT_REFRESH_SECRET: "e2e-refresh-secret-with-at-least-32-characters",
  COOKIE_SECURE: "false",
  TRUST_PROXY: "false"
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  timeout: 60_000,
  expect: { timeout: 10_000 },
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
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: backendEnv
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 5173",
      url: "http://127.0.0.1:5173",
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        VITE_API_URL: "http://127.0.0.1:5001/api/v1",
        VITE_SOCKET_URL: "http://127.0.0.1:5001"
      }
    }
  ]
});
