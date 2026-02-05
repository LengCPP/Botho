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

    // 4. Establish Friendship (Admin setup)
    // We assume the admin is the one running the tests (from global setup)
    await request.post("/api/v1/friends/request", {
      data: { friend_id: targetUser.id }
    })
    // Accept as User B
    await request.post("/api/v1/friends/accept", {
      headers: userBHeaders,
      data: { friend_id: process.env.FIRST_SUPERUSER_ID || "" } // Need to find admin id or just accept all incoming
    })
    
    // Actually, it's easier to just make them friends via DB or direct API calls if IDs are known.
    // Let's use the friend request flow. User B accepts.
    const incomingRes = await request.get("/api/v1/friends/requests", { headers: userBHeaders })
    const incoming = await incomingRes.json()
    if (incoming.data.length > 0) {
        await request.post("/api/v1/friends/accept", {
            headers: userBHeaders,
            data: { friend_id: incoming.data[0].id }
        })
    }
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
