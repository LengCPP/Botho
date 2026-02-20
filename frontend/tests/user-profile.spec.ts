import { expect, test } from "@playwright/test"

test.describe("User Profile Features", () => {
  let targetUser: any
  let userBToken: string

  test.beforeAll(async ({ request }) => {
    // 1. Create User B (Target)
    const email = `target.user.${Date.now()}@example.com`
    const password = "password123"
    const fullName = "Target User"

    const userRes = await request.post("/api/v1/users/signup", {
      data: { email, password, full_name: fullName },
    })

    if (!userRes.ok()) {
      const text = await userRes.text()
      console.error(`Failed to signup user B (${userRes.status()}):`, text)
      return
    }

    // We need to verify this user in the DB. Since we are running outside docker,
    // we assume the agent (me) will handle it or it's handled via a hook if possible.
    // For now, I will manually run the verification command again after this if needed.

    targetUser = await userRes.json()

    // 2. Login as User B
    const loginRes = await request.post("/api/v1/login/access-token", {
      form: { username: email, password: password },
    })

    if (!loginRes.ok()) {
      const text = await loginRes.text()
      console.error(`Failed to login as user B (${loginRes.status()}):`, text)
      // If it's "User not verified", we'll see it here.
      return
    }

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

    // 4. Establish Friendship (Admin sends request, User B accepts)
    await request.post(`/api/v1/friends/request/${targetUser.id}`, {})

    // Accept as User B using incoming request ID
    const incomingRes = await request.get("/api/v1/friends/requests", {
      headers: userBHeaders,
    })
    const incoming = await incomingRes.json()
    if (incoming.data && incoming.data.length > 0) {
      await request.post(`/api/v1/friends/accept/${incoming.data[0].id}`, {
        headers: userBHeaders,
      })
    }
  })

  test("Visit Friend Profile and Verify Views", async ({ page }) => {
    // Navigate to Target User's Profile
    // (As the default logged-in Admin from global setup)
    await page.goto(`/users/${targetUser.id}`)

    // 1. Verify Default Item View (Flat List)
    // ItemsBrowser shows "Items" or "Books" heading (no count in heading)
    await expect(page.getByText("Dune")).toBeVisible({ timeout: 15000 })

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
