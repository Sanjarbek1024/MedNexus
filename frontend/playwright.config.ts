import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { defineConfig } from "@playwright/test";

// The smoke test runs against a throwaway database, with the LLM disabled so it is deterministic.
const python = process.platform === "win32" ? "..\\backend\\.venv\\Scripts\\python.exe" : "../backend/.venv/bin/python";
const dataDir = mkdtempSync(join(tmpdir(), "mednexus-e2e-"));

export default defineConfig({
  testDir: "e2e",
  timeout: 180_000,
  expect: { timeout: 20_000 },
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5174",
    // Use an installed Edge/Chrome where available (CI can set PW_CHANNEL= to use bundled Chromium).
    channel: process.env.PW_CHANNEL ?? (process.platform === "win32" ? "msedge" : undefined),
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: `${python} -m uvicorn app.main:app --app-dir ../backend --port 8001`,
      url: "http://localhost:8001/api/health",
      timeout: 240_000,
      env: { DATA_DIR: dataDir, GROQ_API_KEY: "", CORS_ORIGINS: '["http://localhost:5174"]' },
    },
    {
      command: "npx vite --port 5174 --strictPort",
      url: "http://localhost:5174",
      timeout: 60_000,
      env: { API_URL: "http://localhost:8001" },
    },
  ],
});
