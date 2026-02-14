import { expect, test } from "@playwright/test"

test.describe("Loan Lifecycle", () => {
  let borrower: any
  let borrowerHeaders: any
  let itemToLoan: any

  test.beforeAll(async ({ request }) => {
    // 1. Create Borrower User
    const email = `borrower.${Date.now()}@example.com`
    const password = "password123"
    const fullName = "Test Borrower"

    const userRes = await request.post("/api/v1/users/signup", {
      data: { email, password, full_name: fullName },
    })
    borrower = await userRes.json()

    // 2. Login as Borrower to get token
    const loginRes = await request.post("/api/v1/login/access-token", {
      form: { username: email, password: password },
    })
    const loginData = await loginRes.json()
    borrowerHeaders = { Authorization: `Bearer ${loginData.access_token}` }

    // 3. Admin (Default User) creates an item to be loaned
    // We'll do this via API for speed, then test UI for loaning it
    const itemRes = await request.post("/api/v1/items/", {
      data: {
        title: `Loanable Book ${Date.now()}`,
        description: "Available for loan",
        item_type: "book",
      },
    })
    itemToLoan = await itemRes.json()
    
    // 4. Ensure they are friends so they can see each other's items if private
    // or just assume public for this test.
    // Let's make them friends to be safe.
    await request.post("/api/v1/friends/request", {
      data: { friend_id: borrower.id },
    })
    // Accept as borrower
    await request.post("/api/v1/friends/accept", {
      headers: borrowerHeaders,
      data: { friend_id: process.env.FIRST_SUPERUSER_ID || "" }, // This might fail if ID not in env
    })
    // Fallback: search and accept
    const incomingRes = await request.get("/api/v1/friends/requests", { headers: borrowerHeaders })
    const incoming = await incomingRes.json()
    if (incoming.data.length > 0) {
      await request.post("/api/v1/friends/accept", {
        headers: borrowerHeaders,
        data: { friend_id: incoming.data[0].id },
      })
    }
  })

  test("Borrower can request a loan and Owner can accept", async ({ page, request }) => {
    // --- Phase 1: Borrower Requests Loan (via UI or API?) ---
    // Let's use UI for the request as Borrower
    // We need to login as Borrower in the page
    // Playwright supports multiple sessions, but for simplicity let's use the API for the request
    // and UI for the Owner (Admin) to respond.
    
    const startDate = new Date()
    const endDate = new Date()
    endDate.setDate(endDate.getDate() + 7)

    const loanReqRes = await request.post("/api/v1/loans/request", {
      headers: borrowerHeaders,
      data: {
        item_id: itemToLoan.id,
        start_date: startDate.toISOString(),
        end_date: endDate.toISOString(),
      },
    })
    expect(loanReqRes.ok()).toBeTruthy()
    const loan = await loanReqRes.json()

    // --- Phase 2: Owner (Admin) views and accepts loan in UI ---
    await page.goto("/loans")
    await expect(page.getByRole("heading", { name: "Loan Management" })).toBeVisible()
    
    // Switch to Incoming tab
    await page.getByRole("tab", { name: /Incoming/i }).click()
    
    // Find the loan request
    const loanCard = page.locator(".chakra-card").filter({ hasText: itemToLoan.title })
    await expect(loanCard).toBeVisible()
    await expect(loanCard).toContainText("PENDING")
    
    // Accept Loan
    await loanCard.getByRole("button", { name: "Accept" }).click()
    await expect(loanCard).toContainText("ACCEPTED")

    // --- Phase 3: Borrower ratifies loan (via API for speed) ---
    const ratifyRes = await request.patch(`/api/v1/loans/${loan.id}/ratify`, {
      headers: borrowerHeaders
    })
    expect(ratifyRes.ok()).toBeTruthy()

    // --- Phase 4: Owner sees loan is ACTIVE ---
    await page.reload()
    await page.getByRole("tab", { name: /Incoming/i }).click()
    await expect(loanCard).toContainText("ACTIVE")
    
    // --- Phase 5: Borrower signals return (via API) ---
    await request.patch(`/api/v1/loans/${loan.id}/return-signal`, {
      headers: borrowerHeaders
    })
    
    // --- Phase 6: Owner confirms return in UI ---
    await page.reload()
    await page.getByRole("tab", { name: /Incoming/i }).click()
    await expect(loanCard).toContainText("RETURN_PENDING")
    
    await loanCard.getByRole("button", { name: "Confirm Return" }).click()
    await expect(loanCard).toContainText("RETURNED")
  })
})
