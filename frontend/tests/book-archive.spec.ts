import { expect, test } from "@playwright/test"

test.describe("Book Archive and Enrichment", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/book-archive")
  })

  test("Verify Book Archive page loads and shows books", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Book Archive Management" })).toBeVisible()
    
    // Check if table is visible
    const table = page.locator("table")
    await expect(table).toBeVisible()
    
    // Check if at least some rows are loaded
    const rows = page.locator("tbody tr")
    await expect(rows.first()).toBeVisible({ timeout: 10000 })
  })

  test("Verify infinite scroll", async ({ page }) => {
    const loadMoreButton = page.getByRole("button", { name: /Load More/i })
    
    // Scroll to bottom to ensure button is visible if it exists
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    
    if (await loadMoreButton.isVisible()) {
      const initialRowCount = await page.locator("tbody tr").count()
      await loadMoreButton.click()
      
      // Wait for more rows to load
      await expect(async () => {
        const newRowCount = await page.locator("tbody tr").count()
        expect(newRowCount).toBeGreaterThan(initialRowCount)
      }).toPass()
    } else {
      console.log("Archive has fewer than 100 items, Load More not visible.")
    }
  })

  test("Verify selection logic (Set-based)", async ({ page }) => {
    // Select first row
    const firstRowCheckbox = page.locator("tbody tr").first().locator("input[type='checkbox']")
    await firstRowCheckbox.check()
    
    // Verify "Enrich Selected" button appears
    const enrichButton = page.getByRole("button", { name: /Enrich Selected/i })
    await expect(enrichButton).toBeVisible()
    await expect(enrichButton).toContainText("(1)")
    
    // Select second row
    const secondRowCheckbox = page.locator("tbody tr").nth(1).locator("input[type='checkbox']")
    await secondRowCheckbox.check()
    await expect(enrichButton).toContainText("(2)")
    
    // Unselect first row
    await firstRowCheckbox.uncheck()
    await expect(enrichButton).toContainText("(1)")
    
    // Select All
    const selectAllCheckbox = page.locator("thead th").first().locator("input[type='checkbox']")
    await selectAllCheckbox.check()
    
    const rowCount = await page.locator("tbody tr").count()
    await expect(enrichButton).toContainText(`(${rowCount})`)
  })

  test("Verify enrichment dialog and options", async ({ page }) => {
    // Select one book to enable the button
    await page.locator("tbody tr").first().locator("input[type='checkbox']").check()
    await page.getByRole("button", { name: /Enrich Selected/i }).click()
    
    // Verify dialog title
    await expect(page.getByRole("heading", { name: "Enrich 1 Books" })).toBeVisible()
    
    // Verify source API options
    await expect(page.getByLabel("Auto (Google → OpenLib)")).toBeVisible()
    await expect(page.getByLabel("Google Books Only")).toBeVisible()
    
    // Verify field options
    await expect(page.getByLabel("Description")).toBeVisible()
    await expect(page.getByLabel("ISBN")).toBeVisible()
    await expect(page.getByLabel("Cover Image")).toBeVisible()
    
    // Verify Overwrite option and explanatory text
    await expect(page.getByLabel("Overwrite existing data if found")).toBeVisible()
    await expect(page.getByText("If checked, fetched data will replace current values")).toBeVisible()
    
    // Close dialog
    await page.getByRole("button", { name: "Cancel" }).click()
    await expect(page.getByRole("heading", { name: "Enrich 1 Books" })).not.toBeVisible()
  })

  test("Verify filter changes refresh the list", async ({ page }) => {
    const filterSelect = page.locator("select").first()
    await filterSelect.selectOption("image")
    
    // Wait for the URL to update
    await expect(page).toHaveURL(/filter_missing=image/)
    
    // Table should reload
    await expect(page.locator("tbody tr").first()).toBeVisible()
  })
})
