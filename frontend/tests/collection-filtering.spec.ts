import { expect, test } from "@playwright/test"

test("Collections: Filtering by Author, Category, Genre, and Subject", async ({
  page,
}) => {
  test.setTimeout(120000)
  const uniqueId = Date.now()
  const titleFull = `Book Full ${uniqueId}`
  const titleEmpty = `Book Empty ${uniqueId}`
  const authorFull = `000 Author Full ${uniqueId}`
  // We'll leave the empty book's author empty to test "Others" for author,
  // or give it a unique author to test "Others" for category/genre/subject.
  // Let's give it a unique author to ensure we can find it easily,
  // and we'll rely on the fact that we don't set category/genre/subject.
  const authorEmpty = `000 Author Empty ${uniqueId}`

  // 1. Login and Navigate
  await page.goto("/items")

  // --- Create "Full" Item ---
  await page.getByRole("button", { name: /New Item/i }).click()
  const newItemTab = page.getByRole("tab", { name: "New Item" })
  if (await newItemTab.isVisible()) {
    await newItemTab.click()
  }

  // Type: Book
  await page.selectOption("select#item_type", "book")

  // Fill Title
  await page.locator('input[name="title"]').fill(titleFull)

  // Fill Author
  await page.locator('input[name="extra_data.author"]').fill(authorFull)

  // Fill Subjects (Work Info)
  await page.locator('input[name="work_info.tags"]').fill("Space, Aliens")

  // Select Category: Fiction
  await page.selectOption("select#category", "Fiction")

  // Select Genre: Science Fiction (Sci-Fi)
  await page.selectOption("select#genre", "Science Fiction (Sci-Fi)")

  await page.getByRole("button", { name: "Save" }).click()

  // Wait for dialog to close and item to appear (or toast)
  await expect(
    page.getByText("Item created successfully").first(),
  ).toBeVisible()
  await page.waitForTimeout(1000) // Allow list refresh

  // --- Create "Empty" Item ---
  await page.getByRole("button", { name: /New Item/i }).click()
  if (await newItemTab.isVisible()) {
    await newItemTab.click()
  }

  await page.selectOption("select#item_type", "book")
  await page.locator('input[name="title"]').fill(titleEmpty)
  await page.locator('input[name="extra_data.author"]').fill(authorEmpty)

  // Intentionally leave Category, Genre, and Subjects EMPTY

  await page.getByRole("button", { name: "Save" }).click()
  await expect(
    page.getByText("Item created successfully").first(),
  ).toBeVisible()
  await page.waitForTimeout(1000)

  // --- Verify "Organize By" Default (Subject) ---
  // Default is usually Subject or whatever was last persisted.
  // Ensure we are in "Collections" display type
  // Locate the display type toggle if needed, but default is usually collections.

  // Let's force "Subject" organization
  // Find the "Organize by" dropdown or menu.
  // The UI has ItemsViewOptions.
  // We need to click "View Options" usually?
  // In `Items.tsx`: <ItemsViewOptions ... showDisplayToggle={true} ... />
  // It's likely a button or menu.
  // Let's look for "Organize by" text or aria-label.

  // Just in case, reload to reset state or ensure we are on /items
  await page.goto("/items")

  // Check if we are in list/card mode or collection mode.
  // If we see "My Items" and a grid of folders, we are in collection mode.
  // If we see cards, we are in items mode.
  // We can try to switch to Collections mode explicitly if needed.
  // There is a toggle button usually.

  // Let's interact with the View Options menu.
  // Usually an icon button.
  // Let's try to find text "Organize by" by clicking the options button if it exists.
  // Or maybe it's visible.

  // Assuming the test starts with default state.
  // Let's try to find the "Organize by" select/menu.
  // Based on code, `ItemsViewOptions` renders `MenuRoot` or `Popover`.

  // Let's find the "View Options" button.
  // It usually has a specific icon or tooltip.
  // Inspecting `frontend/src/components/Items/ItemsViewOptions.tsx` would help, but let's guess it's accessible.
  // Actually, let's just use the URL query params to force the view!
  // That's much more reliable for testing the filtering logic itself rather than the UI menu.

  // --- Test 1: Organize by Subject ---
  await page.goto("/items?display_type=collections&organize_by=subject")
  await expect(page.getByRole("heading", { name: "My Items" })).toBeVisible()

  // Verify "Space" collection exists
  await expect(page.getByText("Space").first()).toBeVisible()
  // Verify "Others" collection exists (for the empty book)
  await expect(page.getByText("Others").first()).toBeVisible()

  // Click "Space"
  await page.getByText("Space").first().click()

  // Should see Title Full, NOT Title Empty
  await expect(page.getByText(titleFull).first()).toBeVisible()
  await expect(page.getByText(titleEmpty).first()).not.toBeVisible()

  // Go back (Back to Collections button)
  await page.getByRole("button", { name: "Collections" }).click()

  // Click "Others"
  await page.getByText("Others").first().click()

  // Should see Title Empty, NOT Title Full
  // Note: "Others" might contain other items from previous tests, so we just check presence/absence of ours.
  await expect(page.getByText(titleEmpty).first()).toBeVisible()
  await expect(page.getByText(titleFull).first()).not.toBeVisible()

  // --- Test 2: Organize by Category ---
  await page.goto("/items?display_type=collections&organize_by=category")

  // Verify "Fiction" exists
  await expect(page.getByText("Fiction").first()).toBeVisible()
  // Verify "Others" exists
  await expect(page.getByText("Others").first()).toBeVisible()

  // Click "Fiction"
  await page.getByText("Fiction").first().click()
  await expect(page.getByText(titleFull).first()).toBeVisible()
  await expect(page.getByText(titleEmpty).first()).not.toBeVisible()

  await page.getByRole("button", { name: "Collections" }).click()

  // Click "Others"
  await page.getByText("Others").first().click()
  await expect(page.getByText(titleEmpty).first()).toBeVisible()
  await expect(page.getByText(titleFull).first()).not.toBeVisible()

  // --- Test 3: Organize by Genre ---
  await page.goto("/items?display_type=collections&organize_by=genre")

  // Verify "Science Fiction (Sci-Fi)" exists (it might be truncated in UI, but text should match)
  await expect(page.getByText("Science Fiction (Sci-Fi)").first()).toBeVisible()
  await expect(page.getByText("Others").first()).toBeVisible()

  // Click Genre
  await page.getByText("Science Fiction (Sci-Fi)").first().click()
  await expect(page.getByText(titleFull).first()).toBeVisible()
  await expect(page.getByText(titleEmpty).first()).not.toBeVisible()

  await page.getByRole("button", { name: "Collections" }).click()

  // Click "Others"
  await page.getByText("Others").first().click()
  await expect(page.getByText(titleEmpty).first()).toBeVisible()
  await expect(page.getByText(titleFull).first()).not.toBeVisible()

  // --- Test 4: Organize by Author ---
  await page.goto("/items?display_type=collections&organize_by=author")

  // Verify Authors exist
  await expect(page.getByText(authorFull).first()).toBeVisible()
  await expect(page.getByText(authorEmpty).first()).toBeVisible()

  // Click Author Full
  await page.getByText(authorFull).first().click()
  await expect(page.getByText(titleFull).first()).toBeVisible()
  await expect(page.getByText(titleEmpty).first()).not.toBeVisible()

  await page.getByRole("button", { name: "Collections" }).click()

  // Click Author Empty
  await page.getByText(authorEmpty).first().click()
  await expect(page.getByText(titleEmpty).first()).toBeVisible()
  await expect(page.getByText(titleFull).first()).not.toBeVisible()

  // cleanup?
  // Playwright tests usually run in isolation or cleanup is hard.
  // Given we use unique IDs, it shouldn't affect future runs much,
  // though database might grow.
})
