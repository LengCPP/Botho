import { expect, test as setup } from "@playwright/test"

const authFile = "playwright/.auth/user.json"

setup("authenticate", async ({ page }) => {
  await page.goto("/login")

  const email = process.env.FIRST_SUPERUSER
  const password = process.env.FIRST_SUPERUSER_PASSWORD

  if (!email || !password) {
    throw new Error("FIRST_SUPERUSER or FIRST_SUPERUSER_PASSWORD not found in environment variables")
  }

  await page.getByPlaceholder("Email").fill(email)
  await page.getByPlaceholder("Password").fill(password)
  await page.getByRole("button", { name: "Log In", exact: true }).click()

  // Wait for the UI to reflect logged in state
  await expect(page.getByTestId("user-menu")).toBeVisible({ timeout: 30000 })

  await page.context().storageState({ path: authFile })
})
