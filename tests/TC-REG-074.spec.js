import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { LoginPage } from '../pages/loginpage.page';

const LOGIN_URL = 'https://sit-ireland-dashboard.ittikar.com/login';

function getLatestSuccessfulSignup() {
  const signupResults = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'test-data', 'signupResults.json'), 'utf8')
  );

  const successfulSignups = signupResults.filter(entry => entry.status === 'SUCCESS');
  return successfulSignups[successfulSignups.length - 1];
}

test('TC-REG-074', async ({ page }) => {
  const user = getLatestSuccessfulSignup();
  if (!user) {
    throw new Error('No SUCCESS signup found in signupResults.json');
  }

  const loginPage = new LoginPage(page);

  await loginPage.goto(LOGIN_URL);
  await loginPage.login(user.email, user.password);

  await page.waitForURL(url => url.pathname.startsWith('/itti'), { timeout: 45000 });

  // Dismiss the first-login "Quick tour" prompt if it appears. 
  await page.getByRole('button', { name: 'Not now' }).click({ timeout: 5000 }).catch(() => {});

  await page.getByRole('button', { name: 'Self-Service Onboarding' }).click();

  await expect(
    page.getByText('Would you like to proceed with Self-Service Onboarding?')
  ).toBeVisible({ timeout: 45000 });
});
