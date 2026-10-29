import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/loginpage.page';
import { DashboardPage } from '../pages/dashboardpage.page';
import { UsersPage } from '../pages/userspage.page';

const LOGIN_URL = 'https://sit-ireland-dashboard.ittikar.com/login';

const ROOT_USER = {
  email: 'sasottijotro-8363@yopmail.com',
  password: 'Qwerty@123',
};

test('TC-REG-111', async ({ page }) => {
  const loginPage = new LoginPage(page);
  const dashboardPage = new DashboardPage(page);
  const usersPage = new UsersPage(page);

  await loginPage.goto(LOGIN_URL);
  await loginPage.login(ROOT_USER.email, ROOT_USER.password);

  await dashboardPage.waitForLoad();
  await dashboardPage.dismissQuickTour();
  await dashboardPage.goToUsers();

  const timestamp = Date.now();
  const normalUserEmail = `normal.user.${timestamp}@yopmail.com`;
  const adminUserEmail = `admin.user.${timestamp}@yopmail.com`;

  await usersPage.inviteUser({
    firstName: 'Normal',
    lastName: 'User',
    email: normalUserEmail,
    role: 'Normal',
  });

  await usersPage.inviteUser({
    firstName: 'Admin',
    lastName: 'User',
    email: adminUserEmail,
    role: 'Admin',
  });

  await expect(page.getByText(normalUserEmail)).toBeVisible();
  await expect(page.getByText(adminUserEmail)).toBeVisible();
});
