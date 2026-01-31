import { expect, test } from "@playwright/test"

test("Item Copy Specifics: Create, View, and Update", async ({ page }) => {
  const uniqueTitle = `Test Book ${Date.now()}`

  // 1. Login and Navigate
  await page.goto("/")

  // 2. Create Item with Copy Specifics
  await page.getByRole("button", { name: /New Item/i }).click()

  // If in a community/collection context with tabs, select "New Item" tab if visible
  // The dialog might default to "From My Collection" if in a community
  // But on the dashboard it usually opens the form directly.
  // Let's handle the tab if it exists.
  const newItemTab = page.getByRole("tab", { name: "New Item" })
  if (await newItemTab.isVisible()) {
    await newItemTab.click()
  }

  // Select Item Type = Book
  await page.selectOption("select#item_type", "book")

  // Fill Basic Info
  // If it's a book search input, we might need to handle it differently.
  // The code has: itemType === "book" ? <BookSearchInput ... /> : <Input ... />
  // But BookSearchInput usually has an input field.
  // Let's try filling the title.
  await page.locator('input[name="title"]').fill(uniqueTitle)
  // Wait for search debounce if necessary, but we can just use manual entry if allowed?
  // BookSearchInput triggers search. If we just type, it should be the title.
  // Note: BookSearchInput usually expects selection from dropdown, but `register` might capture the input value?
  // Looking at AddItem.tsx:
  // <BookSearchInput ... onSelect={handleBookSelect} />
  // It doesn't seem to bind "title" directly to the input for *typing* unless BookSearchInput handles it.
  // Actually, BookSearchInput usually allows typing a title.
  // Let's assume standard input behavior for now.

  await page.getByPlaceholder("Author").fill("Test Author")

  // 3. Add Additional Info
  await page
    .getByRole("button", { name: "Add Additional Info (Condition, Notes)" })
    .click()

  await page.locator('input[name="info.grade"]').fill("9")
  await page
    .locator('textarea[name="info.physical_description"]')
    .fill("Like new, first edition.")

  await page.getByRole("button", { name: "Save" }).click()

  // 4. Verify Item Creation
  // Wait for dialog to close and item to appear
  await expect(page.getByText(uniqueTitle)).toBeVisible()

  // 5. Interact with Card
  const card = page
    .locator(".chakra-card")
    .filter({ hasText: uniqueTitle })
    .first()
  // Depending on structure, the card click flips it.
  // The click handler is on the Front Face Card.Root.
  // We need to target the front face specifically?
  // The component has two Card.Roots absolute positioned.
  // The front face has the title.
  await card.click({ force: true }) // Force because of potential overlap/3d transforms

  // 6. View Additional Info
  // Wait for back face to be visible (transform) - simpler to check for content on back face
  // The Back face has "General" or "Book" badge.
  await expect(page.getByLabel("Additional Info")).toBeVisible()
  await page.getByLabel("Additional Info").click()

  await expect(page.getByText("Copy Specifics")).toBeVisible()
  await expect(page.getByText("9/10")).toBeVisible()
  await expect(page.getByText("Like new, first edition.")).toBeVisible()

  // 7. Update Additional Info
  await page.getByRole("button", { name: "Update Info" }).click()

  // Dialog opens with "Update Copy Specifics"
  await expect(
    page.getByRole("heading", { name: "Update Copy Specifics" }),
  ).toBeVisible()

  await page.locator('input[name="info.grade"]').fill("8")
  await page.getByRole("button", { name: "Save" }).click()

  // 8. Verify Update
  // Dialog closes. We should still be on the back of the card in Info mode.
  await expect(page.getByText("8/10")).toBeVisible()
})
