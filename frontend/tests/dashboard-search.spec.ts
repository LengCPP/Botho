import { expect, test } from "@playwright/test"

test.describe("Dashboard Quick Search", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/")
  })

  test("Search for items and see results", async ({ page, request }) => {
    // 1. Create a unique item to search for
    const uniqueTitle = `Searchable Book ${Date.now()}`
    await request.post("/api/v1/items/", {
      data: {
        title: uniqueTitle,
        description: "Find me in search",
        item_type: "book",
      },
    })

    // 2. Type into search input
    const searchInput = page.getByPlaceholder("Quick Search...")
    await searchInput.fill(uniqueTitle)
    
    // 3. Wait for results popover
    const resultsPopover = page.locator("div").filter({ hasText: "Items" }).nth(1)
    await expect(resultsPopover).toBeVisible({ timeout: 10000 })
    
    // 4. Verify item is found
    await expect(page.getByText(uniqueTitle)).toBeVisible()
    
    // 5. Click result and verify navigation
    await page.getByText(uniqueTitle).click()
    // It navigates to /items?q=... or similar
    await expect(page).toHaveURL(/\/items/)
    await expect(page.getByText(uniqueTitle)).toBeVisible()
  })

  test("Search for users by Public ID", async ({ page, request }) => {
    // 1. Get current user's public ID
    const meRes = await request.get("/api/v1/users/me")
    const me = await meRes.json()
    const publicId = me.public_id
    
    expect(publicId).toBeTruthy()

    const searchInput = page.getByPlaceholder("Quick Search...")
    
    // 2. Search by exact Public ID
    await searchInput.fill(publicId)
    await expect(page.locator("div").filter({ hasText: "Users" }).nth(1)).toBeVisible({ timeout: 10000 })
    await expect(page.getByText(me.full_name)).toBeVisible()

    // 3. Search by email (should return NOTHING for users now)
    await searchInput.fill(me.email)
    await expect(page.getByText(me.full_name)).not.toBeVisible()
  })

  test("Search for non-existent term shows empty state", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Quick Search...")
    await searchInput.fill("NonExistentTermXYZ123456789")
    
    await expect(page.getByText(/No results found for/)).toBeVisible({ timeout: 10000 })
  })
})
