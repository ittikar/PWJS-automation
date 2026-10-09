import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/loginpage.page';

const LOGIN_URL = 'https://sit-ireland-dashboard.ittikar.com/login';

const ROOT_USER = {
  email: 'yoprutettokau-3986@yopmail.com',
  password: 'Qwerty@123',
};

async function inviteUser(page, { firstName, lastName, email, role }) {
  await page.getByRole('button', { name: 'Add User', exact: true }).click();

  await page.locator('input[name="first_name"]').fill(firstName);
  await page.locator('input[name="last_name"]').fill(lastName);
  await page.locator('input[name="email"]').fill(email);

  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: role, exact: true }).click();

  await page.getByRole('button', { name: 'Add User', exact: true }).last().click();

  await expect(
    page.getByText('The member has been successfully added. Temporary credentials have been emailed to them.')
  ).toBeVisible({ timeout: 15000 });
}

test('TC-REG-111', async ({ page }) => {
  const loginPage = new LoginPage(page);

  await loginPage.goto(LOGIN_URL);
  await loginPage.login(ROOT_USER.email, ROOT_USER.password);

  await page.waitForURL(url => url.pathname.startsWith('/itti'), { timeout: 45000 });

  // Dismiss the first-login "Quick tour" prompt if it appears.
  await page.getByRole('button', { name: 'Not now' }).click({ timeout: 5000 }).catch(() => {});

  await page.getByRole('link', { name: 'Users' }).click();
  await page.waitForURL(url => url.pathname === '/users', { timeout: 15000 });

  const timestamp = Date.now();
  const normalUserEmail = `normal.user.${timestamp}@yopmail.com`;
  const adminUserEmail = `admin.user.${timestamp}@yopmail.com`;

  await inviteUser(page, {
    firstName: 'Normal',
    lastName: 'User',
    email: normalUserEmail,
    role: 'Normal',
  });

  await inviteUser(page, {
    firstName: 'Admin',
    lastName: 'User',
    email: adminUserEmail,
    role: 'Admin',
  });

  await expect(page.getByText(normalUserEmail)).toBeVisible();
  await expect(page.getByText(adminUserEmail)).toBeVisible();
});
