import { test, expect } from '@playwright/test';

test('dashboard should load and display core sections', async ({ page }) => {
  await page.goto('/');
  
  // Check for Sidebar items
  await expect(page.getByRole('link', { name: 'Items' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Communities' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Friends' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Loans' })).toBeVisible();
  
  // Check for Header elements
  await expect(page.getByTestId('user-menu')).toBeVisible();
});

test('can navigate to communities page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Communities' }).click();
  await expect(page).toHaveURL(/\/communities/);
  await expect(page.getByRole('heading', { name: 'Communities' })).toBeVisible();
});
