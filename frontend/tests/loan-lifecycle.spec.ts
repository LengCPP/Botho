import { expect, test } from "@playwright/test"

test.describe("Loan Lifecycle", () => {
  let borrower: any
  let borrowerHeaders: any
  let adminHeaders: any
  let itemToLoan: any

  test.beforeAll(async ({ request }) => {
    // 0. Login as Admin to get admin token for verification and other setup
    const adminLoginRes = await request.post("/api/v1/login/access-token", {
      form: {
        username: process.env.FIRST_SUPERUSER || "",
        password: process.env.FIRST_SUPERUSER_PASSWORD || "",
      },
    })
    const adminLoginData = await adminLoginRes.json()
    adminHeaders = { Authorization: `Bearer ${adminLoginData.access_token}` }

    // 1. Create Borrower User
    const email = `borrower.${Date.now()}@example.com`
    const password = "password123"
    const fullName = "Test Borrower"

    const userRes = await request.post("/api/v1/users/signup", {
      data: { email, password, full_name: fullName },
    })
    borrower = await userRes.json()

    // Verify Borrower via Admin
    await request.patch(`/api/v1/users/${borrower.id}`, {
      headers: adminHeaders,
      data: { is_verified: true },
    })

    // 2. Login as Borrower to get token
    const loginRes = await request.post("/api/v1/login/access-token", {
      form: { username: email, password: password },
    })
    const loginData = await loginRes.json()
    if (!loginRes.ok()) {
      console.error("Borrower Login Failed:", loginData)
    }
    borrowerHeaders = { Authorization: `Bearer ${loginData.access_token}` }

    // 3. Admin (Default User) creates an item to be loaned
    const itemRes = await request.post("/api/v1/items/", {
      headers: adminHeaders,
      multipart: {
        title: `Loanable Book ${Date.now()}`,
        description: "Available for loan",
        item_type: "book",
      },
    })
    itemToLoan = await itemRes.json()
    expect(itemRes.ok()).toBeTruthy()

    // 4. Make them friends
    await request.post(`/api/v1/friends/request/${borrower.id}`, {
      headers: adminHeaders,
    })

    // Accept as borrower
    await request
      .post("/api/v1/friends/accept", {
        headers: borrowerHeaders,
        data: { friend_id: adminLoginData.id || "" }, // This might still be tricky if ID not returned
      })
      .catch(() => {})

    // Fallback: search and accept
    const incomingRes = await request.get("/api/v1/friends/requests", {
      headers: borrowerHeaders,
    })
    const incoming = await incomingRes.json()
    if (incoming.data && incoming.data.length > 0) {
      await request.post(`/api/v1/friends/accept/${incoming.data[0].id}`, {
        headers: borrowerHeaders,
      })
    }
  })

  test("Borrower can request a loan and Owner can accept", async ({
    page,
    request,
  }) => {
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
    await expect(
      page.getByRole("heading", { name: "Loans & Possession" }),
    ).toBeVisible()

    // Find the loan request in Actionable Requests section
    const loanCard = page
      .locator("div")
      .filter({ hasText: itemToLoan.title })
      .filter({ hasText: /PENDING|ACCEPTED|ACTIVE|RETURN/ })
      .last()
    await expect(loanCard).toBeVisible({ timeout: 15000 })
    await expect(loanCard).toContainText("PENDING")

    // Accept Loan
    const acceptBtn = loanCard.getByRole("button", { name: "Accept" })
    await acceptBtn.click()
    await expect(loanCard).toContainText("ACCEPTED")

    // --- Phase 3: Borrower ratifies loan (via API for speed) ---
    const ratifyRes = await request.patch(`/api/v1/loans/${loan.id}/ratify`, {
      headers: borrowerHeaders,
    })
    expect(ratifyRes.ok()).toBeTruthy()

    // --- Phase 4: Owner sees loan is ACTIVE ---
    await page.reload()
    await page.getByRole("tab", { name: /Incoming/i }).click()
    await expect(loanCard).toContainText("ACTIVE")

    // --- Phase 5: Borrower signals return (via API) ---
    await request.patch(`/api/v1/loans/${loan.id}/return-signal`, {
      headers: borrowerHeaders,
    })

    // --- Phase 6: Owner confirms return in UI ---
    await page.reload()
    await page.getByRole("tab", { name: /Incoming/i }).click()
    await expect(loanCard).toContainText("RETURN_PENDING")

    await loanCard.getByRole("button", { name: "Confirm Return" }).click()
    await expect(loanCard).toContainText("RETURNED")
  })
})
