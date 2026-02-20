import { expect, test } from "@playwright/test"

test.describe("Dashboard Quick Search", () => {
  let authHeaders: { Authorization: string }

  test.beforeEach(async ({ page, request }) => {
    // Authenticate API request
    const loginRes = await request.post("/api/v1/login/access-token", {
      form: {
        username: process.env.FIRST_SUPERUSER || "",
        password: process.env.FIRST_SUPERUSER_PASSWORD || "",
      },
    })
    const loginData = await loginRes.json()
    authHeaders = { Authorization: `Bearer ${loginData.access_token}` }

    await page.goto("/")
  })

  test("Search for items and see results", async ({ page, request }) => {
    // 1. Create a unique item to search for
    const uniqueTitle = `Searchable Book ${Date.now()}`
    const itemRes = await request.post("/api/v1/items/", {
      headers: authHeaders,
      multipart: {
        title: uniqueTitle,
        description: "Find me in search",
        item_type: "book",
      },
    })
    expect(itemRes.ok()).toBeTruthy()

    // 2. Type into search input
    const searchInput = page.getByPlaceholder(
      "Search items, friends, or communities...",
    )
    await searchInput.fill(uniqueTitle)

    // 3. Wait for results popover
    const resultsPopover = page
      .locator("div")
      .filter({ hasText: "Items" })
      .nth(1)
    await expect(resultsPopover).toBeVisible({ timeout: 15000 })

    // 4. Verify item is found
    await expect(page.getByText(uniqueTitle)).toBeVisible()

    // 5. Click result and verify navigation
    await page.getByText(uniqueTitle).click()
    // It navigates to /items?q=... or similar
    await expect(page).toHaveURL(/\/items/)

    // Items page defaults to "collections" view; force "items" view to see individual cards
    const currentUrl = new URL(page.url())
    currentUrl.searchParams.set("display_type", "items")
    await page.goto(currentUrl.toString())

    // Wait for loading to finish
    await expect(page.locator(".chakra-skeleton")).not.toBeVisible({
      timeout: 30000,
    })

    // Use testid to find the card then check for text
    const itemCard = page
      .getByTestId("item-card")
      .filter({ hasText: uniqueTitle })
    await expect(itemCard).toBeVisible({ timeout: 15000 })
  })

  test("Search for users by Public ID", async ({ page, request }) => {
    // 1. Get current user's public ID
    const meRes = await request.get("/api/v1/users/me", {
      headers: authHeaders,
    })
    const me = await meRes.json()
    console.log("DEBUG ME:", JSON.stringify(me))
    const publicId = me.public_id

    expect(publicId).toBeTruthy()

    const searchInput = page.getByPlaceholder(
      "Search items, friends, or communities...",
    )

    // 2. Search by exact Public ID
    await searchInput.fill(publicId)
    const usersSection = page.locator("div").filter({ hasText: "Users" }).nth(1)
    await expect(usersSection).toBeVisible({ timeout: 15000 })
    // Use role=link to avoid matching the "Welcome back, {name}" heading
    await expect(
      usersSection.getByRole("link").getByText(new RegExp(me.full_name, "i")),
    ).toBeVisible()

    // 3. Search by email (should return NOTHING for users now)
    await searchInput.fill(me.email)
    await expect(
      usersSection.getByRole("link").getByText(new RegExp(me.full_name, "i")),
    ).not.toBeVisible()
  })

  test("Search for non-existent term shows empty state", async ({ page }) => {
    const searchInput = page.getByPlaceholder(
      "Search items, friends, or communities...",
    )
    await searchInput.fill("NonExistentTermXYZ123456789")

    await expect(page.getByText(/No results found for/)).toBeVisible({
      timeout: 15000,
    })
  })
})
