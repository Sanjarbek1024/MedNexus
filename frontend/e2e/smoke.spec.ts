import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const SAMPLE = fileURLToPath(new URL("../../samples/chest_pa_pneumonia.jpg", import.meta.url));

test("sign in → upload → analyze → continue in chat → confirm → worklist", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.org`;
  const password = "Smoke-test-2026";

  // Create an account in English, then sign out and sign back in.
  await page.goto("/signup");
  await page.getByRole("button", { name: "en", exact: true }).click();
  await page.getByLabel("Full name").fill("Dr. Smoke Test");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole("button", { name: /Dr\. Smoke Test/ }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/signin/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  // Upload and analyze a chest X-ray; progress streams until the case opens.
  await page.goto("/analyze");
  await page.locator('input[type="file"]').setInputFiles(SAMPLE);
  await page.getByRole("button", { name: "Analyze", exact: true }).click();
  await expect(page.getByText("Running the safety pipeline")).toBeVisible();
  await expect(page).toHaveURL(/\/cases\/\d+$/, { timeout: 120_000 });
  const caseId = page.url().split("/").pop();
  await expect(page.getByRole("heading", { name: "Consolidation" })).toBeVisible();
  await expect(page.getByText("Safety checks")).toBeVisible();

  // Continue in chat: the question is stored; without an LLM key the assistant says it is unavailable.
  await page.getByRole("button", { name: "Continue in chat" }).click();
  const chat = page.getByRole("dialog", { name: "Case chat" });
  await chat.getByRole("button", { name: "Explain the heatmap" }).click();
  await expect(chat.getByText("Explain the heatmap").last()).toBeVisible();
  await expect(chat.getByRole("alert")).toContainText("assistant");
  await page.keyboard.press("Escape");

  // Confirm the AI draft and sign the structured report.
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Structured report" });
  await expect(editor.getByText("Consolidation").first()).toBeVisible();
  await editor.getByRole("textbox", { name: /Impression/ }).fill("Right upper lobe consolidation, consistent with pneumonia.");
  await editor.getByRole("button", { name: "Sign & finalize" }).click();
  await expect(page.getByText("Report signed").first()).toBeVisible();
  await expect(page.getByText("Reviewed", { exact: true }).first()).toBeVisible();

  // The case now appears as reviewed in the worklist.
  await page.getByRole("link", { name: "Worklist" }).first().click();
  await page.getByRole("tab", { name: "Reviewed" }).click();
  const row = page.getByRole("row").filter({ hasText: `#${String(caseId).padStart(4, "0")}` });
  await expect(row).toContainText("Reviewed");
});
