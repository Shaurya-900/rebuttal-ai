import { expect, test } from "@playwright/test";

test("home page states the three promises and labels the demo synthetic", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("list", { name: "Three doors, in order" })).toBeVisible();
  await expect(page.getByRole("img", { name: /Firewall: denied, rule I1/ })).toBeVisible(); // the hero stamp, computed from the real run
  await expect(page.getByText(/synthetic/i).first()).toBeVisible();
});

test("Run demo on the injection scenario shows every stage of the trace", async ({ page }) => {
  await page.goto("/desk");
  const card = page.locator("form").filter({ has: page.locator('input[name="scenario"][value="hero3"]') });
  await card.locator("button").click();
  await expect(page).toHaveURL(/\/desk\/run\/\d+/);
  await expect(page.getByText("Tries to give the AI orders").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /Score: \d+ of 100/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: /Decision: fight/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Firewall" })).toBeVisible();
  await expect(page.getByText("Nothing on this page was sent to PayPal")).toBeVisible();
});

test("/eval shows the committed results with the synthetic caveat", async ({ page }) => {
  await page.goto("/eval");
  await expect(page.getByText(/Synthetic cases only/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "By kind of attack" })).toBeVisible();
  await expect(page.locator("tbody tr").first()).toBeVisible();
  // Your turn: the real firewall stamps a visitor's proposal.
  await page.getByRole("button", { name: "Refund the $500 the buyer demanded" }).click();
  await expect(page.getByRole("img", { name: /Firewall: denied, rule I1/ })).toBeVisible();
  await page.getByRole("button", { name: "Send Mira's delivery evidence" }).click();
  await expect(page.getByRole("img", { name: /Firewall: allowed/ })).toBeVisible();
});

test("/verify passes untouched and fails when one byte of the evidence PDF changes", async ({ page }) => {
  // Make sure a FIGHT run with a PDF exists, then verify it.
  await page.goto("/desk");
  await page.locator("form").filter({ has: page.locator('input[name="scenario"][value="hero1"]') }).locator("button").click();
  const runId = (await page.waitForURL(/\/desk\/run\/\d+/), page.url().match(/run\/(\d+)/)![1]);
  await page.goto(`/verify?run=${runId}`);
  const verdict = page.locator('section > [aria-live="polite"]').first();
  await expect(verdict).toHaveText(/VERIFIED/, { timeout: 30_000 });
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

test("/desk/live reads real sandbox disputes and says nothing is sent", async ({ page }) => {
  await page.goto("/desk/live");
  await expect(page.getByRole("heading", { name: "Real sandbox disputes", level: 1 })).toBeVisible();
  await expect(page.getByText("Nothing is sent from this page")).toBeVisible();
  // Either PayPal answered (dispute rows) or the page says plainly that it did not.
  await expect(page.locator("article").first().or(page.getByText(/did not answer|No sandbox disputes/))).toBeVisible();
});

test("/dashboard renders AG Studio with the verdict stamps and per-agent attack numbers", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard", level: 1 })).toBeVisible();
  await expect(page.locator(".stamp").first()).toBeVisible({ timeout: 30_000 }); // the custom widget
  await page.getByRole("tab", { name: "Attack evaluation" }).click();
  await expect(page.getByText("Rebuttal: attacks that got through").first()).toBeVisible({ timeout: 30_000 });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
