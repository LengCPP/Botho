import { expect, test } from "@playwright/test"

test.describe("User Profile Features", () => {
  let targetUser: any
  let userBToken: string

  test.beforeAll(async ({ request }) => {
    // 1. Create User B (Target)
    const email = `target.user.${Date.now()}@example.com`
    const password = "password123"
    const fullName = "Target User"

    const userRes = await request.post("/api/v1/users/", {
      data: { email, password, full_name: fullName, is_active: true },
    })

    // If we fail here (e.g. 403 Forbidden because we aren't admin), we skip.
    // Assuming the test runner uses the admin storageState.
    if (!userRes.ok()) {
      console.error("Failed to create user:", await userRes.text())
      return
    }
    targetUser = await userRes.json()

    // 2. Login as User B to create items (to ensure ownership)
    const loginRes = await request.post("/api/v1/login/access-token", {
      form: { username: email, password: password },
    })
    const loginData = await loginRes.json()
    userBToken = loginData.access_token

    // Helper headers for User B
    const userBHeaders = { Authorization: `Bearer ${userBToken}` }

    // 3. Create Item for User B
    await request.post("/api/v1/items/", {
      headers: userBHeaders,
      data: {
        title: "Dune",
        description: "A Sci-Fi masterpiece",
        work_metadata: {
          tags: ["Science Fiction", "Adventure"],
        },
      },
    })
  })

  test("Visit Friend Profile and Verify Views", async ({ page }) => {
    // Navigate to Target User's Profile
    // (As the default logged-in Admin from global setup)
    await page.goto(`/users/${targetUser.id}`)

    // 1. Verify Default Item View (Flat List)
    // We expect "Items (1)" or similar heading
    await expect(
      page.getByRole("heading", { name: /Items \(\d+\)/ }),
    ).toBeVisible()
    await expect(page.getByText("Dune")).toBeVisible()

    // 2. Verify Smart Grouping (Subject View)
    // Click "Collection View" toggle button (FaFolder icon)
    // The button has title "Collection View"
    const collectionViewBtn = page.getByTitle("Collection View")
    await expect(collectionViewBtn).toBeVisible()
    await collectionViewBtn.click()

    // Expect to see Group Card for "Science Fiction"
    await expect(page.getByText("Science Fiction")).toBeVisible()
    await expect(page.getByText("SUBJECT COLLECTION")).toBeVisible()

    // 3. Drill down into Group
    // GroupCard text is "Science Fiction", click it.
    await page.getByText("Science Fiction").click()

    // Verify Drill-down view
    await expect(page.getByText("Items in Science Fiction")).toBeVisible()
    await expect(page.getByText("Dune")).toBeVisible()

    // 4. Verify Back Navigation
    const backBtn = page.getByRole("button", { name: "Back to Collections" })
    await expect(backBtn).toBeVisible()
    await backBtn.click()

    // Should be back to Group Cards
    await expect(page.getByText("SUBJECT COLLECTION")).toBeVisible()
  })
})
