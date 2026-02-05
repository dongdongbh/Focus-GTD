import { test, expect } from '@playwright/test';

test('loads the inbox view', async ({ page }) => {
    await page.goto('/');
    const inboxNav = page.locator('[data-sidebar-item][data-view="inbox"]');
    await expect(inboxNav).toBeVisible();
    await expect(inboxNav).toHaveAttribute('aria-current', 'page');
});

test('navigates between sidebar views', async ({ page }) => {
    await page.goto('/');
    const projectsNav = page.locator('[data-sidebar-item][data-view="projects"]');
    await projectsNav.click();
    await expect(projectsNav).toHaveAttribute('aria-current', 'page');

    const inboxNav = page.locator('[data-sidebar-item][data-view="inbox"]');
    await inboxNav.click();
    await expect(inboxNav).toHaveAttribute('aria-current', 'page');
});

test('creates and deletes a task from inbox', async ({ page }) => {
    await page.goto('/');

    const quickAddInput = page.getByPlaceholder(/add task/i);
    await quickAddInput.fill('E2E Task');
    await quickAddInput.press('Enter');

    const taskItem = page.locator('[data-task-id]', { hasText: 'E2E Task' });
    await expect(taskItem).toBeVisible();

    await taskItem.hover();
    const deleteButton = taskItem.getByRole('button', { name: /delete/i });
    await deleteButton.click();

    await expect(taskItem).toHaveCount(0);
});
