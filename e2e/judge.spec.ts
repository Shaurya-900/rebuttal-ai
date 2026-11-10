import { expect, test } from "@playwright/test";

test("home page states the three promises and labels the demo synthetic", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Rebuttal", level: 1 })).toBeVisible();
  for (const p of ["Unfoolable", "Crash-proof", "Auditable"]) await expect(page.getByRole("heading", { name: p })).toBeVisible();
  await expect(page.getByText(/synthetic/i).first()).toBeVisible();
});

test("Run demo on the injection scenario shows every stage of the trace", async ({ page }) => {
  await page.goto("/desk");
  const card = page.locator("form").filter({ has: page.locator('input[name="scenario"][value="hero3"]') });
  await card.getByRole("button", { name: "Run demo" }).click();
  await expect(page).toHaveURL(/\/desk\/run\/\d+/);
  await expect(page.getByText("containsInstructions").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /Rubric/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Decision · FIGHT/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Firewall" })).toBeVisible();
  await expect(page.getByText("Nothing on this page was sent to PayPal")).toBeVisible();
});

test("/eval shows the committed results with the synthetic caveat", async ({ page }) => {
  await page.goto("/eval");
  await expect(page.getByText(/Synthetic cases only/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Attacks that succeeded" })).toBeVisible();
  await expect(page.locator("tbody tr").first()).toBeVisible();
});

test("/verify passes untouched and fails when one byte of the evidence PDF changes", async ({ page }) => {
  // Make sure a FIGHT run with a PDF exists, then verify it.
  await page.goto("/desk");
  await page.locator("form").filter({ has: page.locator('input[name="scenario"][value="hero1"]') }).getByRole("button", { name: "Run demo" }).click();
  const runId = (await page.waitForURL(/\/desk\/run\/\d+/), page.url().match(/run\/(\d+)/)![1]);
  await page.goto(`/verify?run=${runId}`);
  const verdict = page.locator("p[aria-live]");
  await expect(verdict).toHaveText(/^Verified/, { timeout: 30_000 });
  await page.getByRole("button", { name: "Change one byte of the PDF" }).click();
  await expect(verdict).toHaveText(/FAILED/, { timeout: 30_000 });
  await page.getByRole("button", { name: "Edit the stored score" }).click();
  await expect(verdict).toHaveText(/FAILED/);
  await expect(page.getByText(/Recomputed chain .* reaches the head/)).toBeVisible();
});

test("policy page is readable but refuses a wrong password", async ({ page }) => {
  await page.goto("/desk/policy");
  await expect(page.getByRole("heading", { name: "Mira's policy" })).toBeVisible();
  const save = page.getByRole("button", { name: "Save policy" });
  if (await save.isDisabled()) return; // editing is off on this deploy: nothing to try
  await page.locator('input[name="token"]').fill("definitely-not-the-password");
  await save.click();
  await expect(page.getByText("Wrong seller password")).toBeVisible();
});
