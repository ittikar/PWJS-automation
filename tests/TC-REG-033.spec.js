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

test('(TC-REG-033) Login Test - validate dashboard', async ({ page }) => {
  const user = getLatestSuccessfulSignup();
  if (!user) {
    throw new Error('No SUCCESS signup found in signupResults.json');
  }

  const loginPage = new LoginPage(page);

  await loginPage.goto(LOGIN_URL);
  await loginPage.login(user.email, user.password);

  // Wait for the post-login redirect rather than the "Good to see you" greeting:
  // that greeting only renders on the account's very first login, so it is not a
  // reliable signal once the account has logged in before (e.g. a prior test run).
  await page.waitForURL(url => url.pathname.startsWith('/itti'), { timeout: 45000 });

  // Confirm it's the right dashboard for the right user via a signal that renders every login.
  await expect(page.getByText(user.email, { exact: false }).first()).toBeVisible();
});
