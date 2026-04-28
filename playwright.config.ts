import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command:
      "npm run build && node -e \"const fs=require('fs'); fs.cpSync('.next/static','.next/standalone/.next/static',{recursive:true,force:true}); if(fs.existsSync('public')) fs.cpSync('public','.next/standalone/public',{recursive:true,force:true}); process.env.PORT='3100'; require('./.next/standalone/server.js')\"",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
