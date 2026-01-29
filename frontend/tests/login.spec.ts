import { expect, test } from "@playwright/test"

test.use({ storageState: { cookies: [], origins: [] } }) // Use empty storage state for login test

test("should login successfully", async ({ page }) => {
  await page.goto("/login")
  await page.getByPlaceholder("Email").fill("validemail@example.com")
  await page.getByPlaceholder("Password").fill("validpassword")
  await page.getByRole("button", { name: "Log In", exact: true }).click()

  await expect(page).toHaveURL("/")
  await expect(page.getByTestId("user-menu")).toBeVisible()
})

test("should show error on invalid credentials", async ({ page }) => {
  await page.goto("/login")
  await page.getByPlaceholder("Email").fill("invalid@test.com")
  await page.getByPlaceholder("Password").fill("wrongpassword")
  await page.getByRole("button", { name: "Log In", exact: true }).click()

  // Assuming there's a toast or error message
  await expect(page.getByText("Incorrect email or password")).toBeVisible()
})
