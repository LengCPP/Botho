import { expect, test } from "@playwright/test"

test.describe("Book Archive and Enrichment", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/book-archive")
    // Wait for initial load to finish (no more loading text)
    await expect(page.getByText("Loading archive...")).not.toBeVisible({
      timeout: 30000,
    })
  })

  test("Verify Book Archive page loads and shows books", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Book Archive Management" }),
    ).toBeVisible()

    // Check if table is visible
    const table = page.locator("table").first()
    await expect(table).toBeVisible({ timeout: 15000 })

    // Check if at least some rows are loaded
    const rows = table.locator("tbody tr")
    await expect(rows.first()).toBeVisible({ timeout: 15000 })
  })

  test("Verify infinite scroll", async ({ page }) => {
    const table = page.locator("table").first()
    const loadMoreButton = page.getByRole("button", { name: /Load More/i })

    // Scroll to bottom to ensure button is visible if it exists
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))

    if (await loadMoreButton.isVisible()) {
      const initialRowCount = await table.locator("tbody tr").count()
      await loadMoreButton.click()

      // Wait for more rows to load
      await expect(async () => {
        const newRowCount = await table.locator("tbody tr").count()
        expect(newRowCount).toBeGreaterThan(initialRowCount)
      }).toPass({ timeout: 15000 })
    } else {
      console.log("Archive has fewer than 100 items, Load More not visible.")
    }
  })

  test("Verify selection logic (Set-based)", async ({ page }) => {
    const table = page.locator("table").first()
    // Select first row - click the checkbox control
    const firstRowCheckbox = table
      .locator("tbody tr")
      .first()
      .locator("input[type='checkbox']")
    // Instead of check(), use click() on the parent or control if check() fails
    await firstRowCheckbox.click({ force: true })

    // Verify "Enrich Selected" button appears
    const enrichButton = page.getByRole("button", { name: /Enrich Selected/i })
    await expect(enrichButton).toBeVisible()
    await expect(enrichButton).toContainText("(1)")

    // Select second row
    const secondRowCheckbox = table
      .locator("tbody tr")
      .nth(1)
      .locator("input[type='checkbox']")
    await secondRowCheckbox.click({ force: true })
    await expect(enrichButton).toContainText("(2)")

    // Unselect first row
    await firstRowCheckbox.click({ force: true })
    await expect(enrichButton).toContainText("(1)")

    // Select All
    const selectAllCheckbox = table
      .locator("thead th")
      .first()
      .locator("input[type='checkbox']")
    await selectAllCheckbox.click({ force: true })

    const rowCount = await table.locator("tbody tr").count()
    await expect(enrichButton).toContainText(`(${rowCount})`)
  })

  test("Verify enrichment dialog and options", async ({ page }) => {
    const table = page.locator("table").first()
    // Select one book to enable the button
    await table
      .locator("tbody tr")
      .first()
      .locator("input[type='checkbox']")
      .click({ force: true })
    await page.getByRole("button", { name: /Enrich Selected/i }).click()

    // Verify dialog title
    await expect(
      page.getByRole("heading", { name: /Enrich \d+ Books/ }),
    ).toBeVisible()

    // Verify source API options
    await expect(page.getByLabel("Auto (Google → OpenLib)")).toBeVisible()

    // Verify field options
    await expect(page.getByLabel("Description")).toBeVisible()
    await expect(page.getByLabel("ISBN")).toBeVisible()

    // Close dialog
    await page.getByRole("button", { name: "Cancel" }).click()
    await expect(
      page.getByRole("heading", { name: /Enrich \d+ Books/ }),
    ).not.toBeVisible()
  })

  test("Verify filter changes refresh the list", async ({ page }) => {
    const table = page.locator("table").first()
    const filterSelect = page.locator("select").first()
    await filterSelect.selectOption("image")

    // Wait for the URL to update
    await expect(page).toHaveURL(/filter_missing=image/)

    // Table should reload (wait for loading to finish again)
    await expect(page.getByText("Loading archive...")).not.toBeVisible({
      timeout: 30000,
    })
    await expect(table.locator("tbody tr").first()).toBeVisible({
      timeout: 15000,
    })
  })
})
