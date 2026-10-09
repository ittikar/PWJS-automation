import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { LoginPage } from '../pages/loginpage.page';

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

  await loginPage.goto(LOGIN_URL);
  await loginPage.login(user.email, user.password);

  await page.waitForURL(url => url.pathname.startsWith('/itti'), { timeout: 45000 });

  // Dismiss the first-login "Quick tour" prompt if it appears.
  const notNowBtn = page.getByRole('button', { name: 'Not now' });
  if (await notNowBtn.isVisible().catch(() => false)) {
    await notNowBtn.click();
  }

  // Deal creation is blocked until onboarding is complete.
  await expect(page.getByText("Deals unlock once you're onboarded")).toBeVisible();

  // Onboarding options are offered to the new user.
  await expect(page.getByRole('button', { name: 'Self-Service Onboarding' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Assisted Onboarding' })).toBeVisible();

  // The signing-up user is the ROOT user of their organisation, and it is not yet onboarded.
  await page.goto(ORGANISATIONS_URL);
  await expect(page.getByText('ROOT · READ-WRITE')).toBeVisible();
  await expect(page.getByText('NOT ONBOARDED').first()).toBeVisible();
});
