import { expect, test } from "@playwright/test"

test("Item Copy Specifics: Create, View, and Update", async ({ page }) => {
  const uniqueTitle = `Test Book ${Date.now()}`

  // 1. Login and Navigate
  await page.goto("/items")

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
  // Ensure we are on the right page and view
  await expect(page.getByRole("heading", { name: "My Items" })).toBeVisible()
  
  const itemsViewBtn = page.getByTitle("Item View")
  if (await itemsViewBtn.isVisible()) {
    await itemsViewBtn.click()
    await page.waitForTimeout(1000)
  }

  // Wait for item to appear in the list
  const cardTitle = page.getByText(uniqueTitle).first()
  await cardTitle.waitFor({ state: "visible", timeout: 15000 })

  // 5. Interact with Card
  // Click the specific card containing our title
  const ourCard = page.getByTestId("item-card").filter({ hasText: uniqueTitle }).first()
  await ourCard.scrollIntoViewIfNeeded()
  await ourCard.click({ force: true })
  await page.waitForTimeout(1500) // Give more time for flip animation

  // 6. View Additional Info
  const ourInfoBtn = ourCard.getByLabel("Additional Info")
  await ourInfoBtn.click({ force: true })
  await page.waitForTimeout(1000)

  await expect(page.getByText(/Copy Specifics/i)).toBeVisible()
  await expect(page.getByText("9.0/10")).toBeVisible()
  await expect(page.getByText("Like new, first edition.")).toBeVisible()

  // 7. Update Additional Info
  // It's the only button with a pencil icon in that section
  const updateInfoBtn = ourCard.locator('button').filter({ has: page.locator('svg') }).first()
  await page.waitForTimeout(2000) 
  await updateInfoBtn.click({ force: true })

  // Dialog opens with "Update Copy Specifics"
  await expect(
    page.getByRole("heading", { name: "Update Copy Specifics" }),
  ).toBeVisible()

  await page.locator('input[name="info.grade"]').fill("8")
  await page.getByRole("button", { name: "Save" }).click()

  // 8. Verify Update
  // Dialog closes. We should still be on the back of the card in Info mode.
  await expect(page.getByText("8.0/10")).toBeVisible()

  // 9. Verify Duplication does NOT copy physical specifics
  // Close the back face by clicking title again or just go to ellipsis
  await page.getByText(uniqueTitle).first().click()
  
  // Find ellipsis menu for our card (using existing ourCard variable)
  // The trigger button has no text usually, just an icon.
  // In ItemActionsMenu.tsx: <IconButton variant="ghost" color="inherit"><BsThreeDotsVertical /></IconButton>
  // It doesn't have an explicit aria-label in the code I saw, 
  // but Card might have some or we can find the button.
  await ourCard.locator('button').filter({ has: page.locator('svg') }).last().click()
  
  // Click "I have another copy" (Duplicate)
  await page.getByRole("menuitem", { name: /I have another copy/i }).click()
  
  // Verify toast
  await expect(page.getByText("Another copy added to your collection!")).toBeVisible()
  
  // Now we should have 2 items in the group
  await expect(ourCard.getByText("2")).toBeVisible()
  
  // Click next item in group to see the new copy
  await ourCard.getByLabel("Next Owner").click()
  
  // Flip to back
  await ourCard.click()
  
  // Open info
  await ourCard.getByLabel("Additional Info").click()
  
  // The new copy should NOT have the 8.0/10 grade or the notes.
  // It should show "N/A" for grade and "No specific notes provided."
  await expect(page.getByText("N/A")).toBeVisible()
  await expect(page.getByText("No specific notes provided.")).toBeVisible()
})
