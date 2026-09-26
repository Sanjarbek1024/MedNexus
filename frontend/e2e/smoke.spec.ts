import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

const SAMPLE = fileURLToPath(new URL("../../samples/chest_pa_pneumonia.jpg", import.meta.url));

test("doctor: sign in → intake + image → analyze → continue in chat → confirm → worklist", async ({ page }) => {
  const email = `e2e-${Date.now()}@example.org`;
  const password = "Smoke-test-2026";

  // Create a doctor account in English, then sign out and sign back in.
  await page.goto("/signup");
  await page.getByRole("button", { name: "en", exact: true }).click();
  await page.getByLabel("Full name").fill("Dr. Smoke Test");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await expect(page.getByText("Subscription: free for now")).toBeVisible();  // physicians only
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.getByRole("button", { name: /Dr\. Smoke Test/ }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/signin/);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  // Clinical intake first; the chest X-ray is the optional last step. Progress streams until the case opens.
  await page.goto("/analyze");
  await page.getByRole("spinbutton", { name: "Age" }).fill("54");
  await page.getByLabel("Sex").selectOption("male");
  await page.getByLabel("Chief complaint").fill("Cough and fever");
  await page.getByLabel("History of present illness").fill("Cough for 3 days, fever 38°");
  await page.getByRole("button", { name: "Cough", exact: true }).click();
  await page.getByRole("button", { name: /Imaging \(optional\)/ }).click();
  await page.locator('input[type="file"]').setInputFiles(SAMPLE);
  await page.getByRole("button", { name: "Analyze with image" }).click();
  await expect(page.getByText("Running the safety pipeline")).toBeVisible();
  await expect(page).toHaveURL(/\/cases\/\d+$/, { timeout: 120_000 });
  const caseId = page.url().split("/").pop();
  await expect(page.getByRole("heading", { name: "Consolidation" })).toBeVisible();
  await expect(page.getByText("Safety checks")).toBeVisible();
  // The symptoms travel with the study and appear on the AI differential card.
  await expect(page.getByText("AI differential (image + symptoms)")).toBeVisible();
  await expect(page.getByText("Cough for 3 days, fever 38°")).toBeVisible();

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
  // Agreeing with every AI finding (and no AI differential without an LLM) raises no pre-sign warning.
  await expect(editor.getByText("Check before signing")).toHaveCount(0);
  await editor.getByRole("button", { name: "Sign & finalize" }).click();
  await expect(page.getByText("Report signed").first()).toBeVisible();
  await expect(page.getByText("Reviewed", { exact: true }).first()).toBeVisible();

  // The case now appears as reviewed in the worklist.
  await page.getByRole("link", { name: "Worklist" }).first().click();
  await page.getByRole("tab", { name: "Reviewed" }).click();
  const row = page.getByRole("row").filter({ hasText: `#${String(caseId).padStart(4, "0")}` });
  await expect(row).toContainText("Reviewed");
});

test("doctor: symptoms-only case → rules engine → add imaging later", async ({ page }) => {
  const email = `e2e-clinical-${Date.now()}@example.org`;

  await page.goto("/signup");
  await page.getByRole("button", { name: "en", exact: true }).click();
  await page.getByLabel("Full name").fill("Dr. Intake Test");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("Smoke-test-2026");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("link", { name: "My scans" })).toHaveCount(0);

  // No image: the complaint, symptoms and vitals are enough for a case.
  await page.goto("/analyze");
  await page.getByRole("spinbutton", { name: "Age" }).fill("70");
  await page.getByLabel("Chief complaint").fill("Fever and confusion");
  await page.getByRole("button", { name: "Confusion", exact: true }).click();
  await page.getByRole("spinbutton", { name: "Respiratory rate" }).fill("28");
  await page.getByRole("spinbutton", { name: "SpO₂" }).fill("89");
  // The live triage runs the deterministic rules while typing.
  await expect(page.getByText("NEWS2").first()).toBeVisible();
  await page.getByRole("button", { name: "Build differential" }).click();

  await expect(page).toHaveURL(/\/cases\/\d+$/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Clinical rules engine" })).toBeVisible();
  await expect(page.getByText("Fever and confusion").first()).toBeVisible();
  await expect(page.getByText("Urgent").first()).toBeVisible();  // red flags raise triage without any model
  await expect(page.getByRole("heading", { name: "Add imaging to refine the differential" })).toBeVisible();
});

test("doctor: one-click sample case fills the intake and the image", async ({ page }) => {
  await page.goto("/signup");
  await page.getByRole("button", { name: "en", exact: true }).click();
  await page.getByLabel("Full name").fill("Dr. Sample Test");
  await page.getByLabel("Email").fill(`e2e-sample-${Date.now()}@example.org`);
  await page.getByLabel("Password").fill("Smoke-test-2026");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/dashboard/);

  await page.goto("/analyze");
  await page.getByRole("button", { name: "Load sample case" }).click();
  await page.getByRole("menuitem", { name: /Wrist injury \+ X-ray/ }).click();
  await expect(page.getByText("Sample loaded: Wrist injury + X-ray")).toBeVisible();
  await expect(page.getByLabel("Chief complaint")).toHaveValue("Wrist pain after a fall");
  await expect(page.getByRole("button", { name: "Recent injury", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Analyze with image" })).toBeVisible();  // the X-ray is attached

  await page.getByRole("button", { name: "Load sample case" }).click();
  await page.getByRole("menuitem", { name: /Fever and confusion/ }).click();
  await expect(page.getByText("NEWS2").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Build differential" })).toBeVisible();  // no image for this case
});
