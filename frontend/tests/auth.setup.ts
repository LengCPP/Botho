import { expect, test as setup } from "@playwright/test"

const authFile = "playwright/.auth/user.json"

setup("authenticate", async ({ page }) => {
  await page.goto("/login")

  await page.getByPlaceholder("Email").fill("validemail@example.com")
  await page.getByPlaceholder("Password").fill("validpassword")
  await page.getByRole("button", { name: "Log In", exact: true }).click()

  // Wait for the UI to reflect logged in state
  await expect(page.getByTestId("user-menu")).toBeVisible({ timeout: 15000 })

  await page.context().storageState({ path: authFile })
})
