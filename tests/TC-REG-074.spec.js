import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { LoginPage } from '../pages/loginpage.page';
import { DashboardPage } from '../pages/dashboardpage.page';
import { OnboardingChatPage } from '../pages/onboardingchatpage.page';

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
  const dashboardPage = new DashboardPage(page);
  const onboardingChatPage = new OnboardingChatPage(page);

  await loginPage.goto(LOGIN_URL);
  await loginPage.login(user.email, user.password);

  await dashboardPage.waitForLoad();
  await dashboardPage.dismissQuickTour();

  // The two onboarding paths are offered before picking one.
  await expect(dashboardPage.selfServiceOnboardingBtn).toBeVisible();
  await expect(dashboardPage.assistedOnboardingBtn).toBeVisible();

  await onboardingChatPage.startSelfServiceOnboarding();

  let formVisible = await onboardingChatPage.isAumFormVisible(45000);
  if (!formVisible) {
    // Itti's first reply is sometimes just a conversational confirmation step rather than
    // the form itself; clicking the same entry point again can push it to render the form.
    await onboardingChatPage.retryProceed();
    formVisible = await onboardingChatPage.isAumFormVisible(45000);
  }

  expect(formVisible, 'AUM form (currency, AUM Lower Limit, AUM Upper Limit) should be visible').toBe(true);
});
