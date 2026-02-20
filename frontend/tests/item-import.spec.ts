import path from "node:path"
import { expect, test } from "@playwright/test"

test.describe("Item Import Feature", () => {
  test.beforeEach(async ({ page }) => {
    // We can access import from Dashboard or Communities.
    // Let's use the one in Book Archive (Import & Add tab) for archive import testing
    await page.goto("/book-archive")
    await page.getByRole("tab", { name: /Import & Add/i }).click()
  })

  test("Verify import UI and file upload", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Global Archive Import" }),
    ).toBeVisible()

    // Upload file
    const fileChooserPromise = page.waitForEvent("filechooser")
    await page.getByText("Upload File").click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(path.resolve("test.csv"))

    // Mapping dialog should appear
    await expect(
      page.getByRole("heading", { name: "Map Your Columns" }),
    ).toBeVisible()

    // Select mappings (auto-mapping might not be perfect or implemented in test)
    await page.locator("select#mapping-title").selectOption("title")
    await page.locator("select#mapping-author").selectOption("author")
    await page.locator("select#mapping-isbn").selectOption("isbn")

    // Start Staging
    await page.getByRole("button", { name: "Start Staging" }).click()

    // Should see staged items table
    await expect(page.getByText(/Items Staged/)).toBeVisible({ timeout: 15000 })
    const rows = page.locator("tbody tr")
    await expect(rows.first()).toBeVisible()
  })

  test("Verify editing staged items", async ({ page }) => {
    // First, upload a file to have items to edit
    const fileChooserPromise = page.waitForEvent("filechooser")
    await page.getByText("Upload File").click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(path.resolve("test.csv"))
    await page.getByRole("button", { name: "Start Staging" }).click()

    // Wait for items
    await expect(page.getByText(/Items Staged/)).toBeVisible({ timeout: 15000 })
    const firstRow = page.locator("tbody tr").first()
    await expect(firstRow).toBeVisible({ timeout: 10000 })

    // Click a cell to edit (Title)
    const titleCell = firstRow.locator("td").nth(2)
    await titleCell.click()

    // Input should appear
    const input = titleCell.locator("input")
    await expect(input).toBeVisible()

    const originalValue = await titleCell.textContent()
    await input.fill("Updated Title")
    await input.press("Enter")

    // Wait for update (optimistic UI or reload)
    await expect(titleCell).toContainText("Updated Title")
  })

  test("Verify processing staged items", async ({ page }) => {
    // Upload and stage
    const fileChooserPromise = page.waitForEvent("filechooser")
    await page.getByText("Upload File").click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(path.resolve("test.csv"))
    await page.getByRole("button", { name: "Start Staging" }).click()

    await expect(page.getByText(/Items Staged/)).toBeVisible({ timeout: 15000 })

    // Select first item
    await page
      .locator("tbody tr")
      .first()
      .locator("input[type='checkbox']")
      .check()

    // Process button should be enabled
    const processBtn = page.getByRole("button", {
      name: /Add \d+ to Registry/i,
    })
    await expect(processBtn).toBeEnabled()

    await processBtn.click()

    // Success toast
    await expect(page.getByText("Archive sync started")).toBeVisible()
  })
})
