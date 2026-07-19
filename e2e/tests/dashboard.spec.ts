import { expect, test } from "@playwright/test";

const seeded = test.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(() => window.localStorage.setItem("petal.demo", "seeded"));
    await use(page);
  },
});

test("first run shows Connect screen and seeding reaches the Overview", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Connect Instagram" })).toBeVisible();
  await page.getByRole("button", { name: "Explore with demo data" }).click();
  await expect(page.getByText("Listening for mentions…")).toBeVisible();
  await expect(page.getByText("Pulse · 6h buckets")).toBeVisible();
  await expect(page.getByText("310", { exact: true })).toBeVisible();
  await expect(page.getByText("Demo data")).toBeVisible();
});

seeded("feed filters by negative and opens the mention detail sheet", async ({ page }) => {
  await page.goto("/mentions");
  await expect(page.getByText("14 mentions · 2 negative")).toBeVisible();
  await page.getByRole("button", { name: "Negative", exact: true }).click();
  await expect(page.getByText("2 mentions · 2 negative")).toBeVisible();
  await page.getByText("The phase seems off by a day").click();
  await expect(page.getByText("AI classification")).toBeVisible();
  await expect(page.getByRole("button", { name: "Open on Instagram" })).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();
  await expect(page.getByText("AI classification")).not.toBeVisible();
});

seeded("alert rules toggle on and off", async ({ page }) => {
  await page.goto("/alerts");
  const toggle = page.getByRole("switch", { name: "Toggle Volume spike" });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(page.getByText("1", { exact: true }).first()).toBeVisible();
});

seeded("adding a duplicate hashtag is rejected", async ({ page }) => {
  await page.goto("/hashtags");
  await page.getByPlaceholder("Add a hashtag, e.g. omahi").fill("omahi");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("Already tracking #omahi.")).toBeVisible();
});

seeded("deleting all data returns to the Connect screen", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Delete all data" }).click();
  await page.getByRole("button", { name: "Yes, delete" }).click();
  await expect(page.getByRole("button", { name: "Connect Instagram" })).toBeVisible();
});
