import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { LoginPage } from '../pages/loginpage.page';
import { DashboardPage } from '../pages/dashboardpage.page';
import { OrganisationsPage } from '../pages/organisationspage.page';

const LOGIN_URL = 'https://sit-ireland-dashboard.ittikar.com/login';
const ORGANISATIONS_URL = 'https://sit-ireland-dashboard.ittikar.com/organisation';

function getLatestSuccessfulSignup() {
  const signupResults = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'test-data', 'signupResults.json'), 'utf8')
  );

  const successfulSignups = signupResults.filter(entry => entry.status === 'SUCCESS');
  return successfulSignups[successfulSignups.length - 1];
}

test('TC-REG-044, TC-REG-051, TC-REG-054', async ({ page }) => {
  const user = getLatestSuccessfulSignup();
  if (!user) {
    throw new Error('No SUCCESS signup found in signupResults.json');
  }

  const loginPage = new LoginPage(page);
  const dashboardPage = new DashboardPage(page);
  const organisationsPage = new OrganisationsPage(page);

  await loginPage.goto(LOGIN_URL);
  await loginPage.login(user.email, user.password);

  await dashboardPage.waitForLoad();
  await dashboardPage.dismissQuickTour();

  // Deal creation is blocked until onboarding is complete.
  await expect(dashboardPage.dealsUnlockBanner).toBeVisible();

  // Onboarding options are offered to the new user.
  await expect(dashboardPage.selfServiceOnboardingBtn).toBeVisible();
  await expect(dashboardPage.assistedOnboardingBtn).toBeVisible();

  // The signing-up user is the ROOT user of their organisation, and it is not yet onboarded.
  await organisationsPage.goto(ORGANISATIONS_URL);
  await expect(organisationsPage.rootRoleBadge).toBeVisible();
  await expect(organisationsPage.notOnboardedBadge.first()).toBeVisible();
});
