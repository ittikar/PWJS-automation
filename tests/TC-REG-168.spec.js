import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/loginpage.page';
import { DashboardPage } from '../pages/dashboardpage.page';
import { DealFormPage } from '../pages/dealformpage.page';
import { generateClubDealName } from '../utils/dataGenerator';
import { resetDealResults, recordDealResult, assertAllAssetGroupsCovered } from '../utils/dealResults';

const RESULTS_FILE = 'clubDealResults.json';

const LOGIN_URL = 'https://sit-ireland-dashboard.ittikar.com/login';

function clubDealCreateUrl(assetGroupSlug) {
  return `https://sit-ireland-dashboard.ittikar.com/deals/create/details?assetGroup=${assetGroupSlug}`;
}

const ROOT_USER = { email: 'jebrummadewi-6237@yopmail.com', password: 'Qwerty@123' };
const ASSET_GROUP_SLUGS = [
  'private-equity',
  'real-asset',
  'secondary-pre-ipo',
  'private-credit',
  'other-alternatives',
];

test('TC-REG-168', async ({ page }) => {
  test.setTimeout(300000);

  const loginPage = new LoginPage(page);
  const dashboardPage = new DashboardPage(page);
  const dealFormPage = new DealFormPage(page);

  await loginPage.goto(LOGIN_URL);
  await loginPage.login(ROOT_USER.email, ROOT_USER.password);

  await dashboardPage.waitForLoad();
  await dashboardPage.dismissQuickTour();

  resetDealResults(RESULTS_FILE);

  // Processed one at a time, in a single session: running these concurrently (e.g. as
  // separate Playwright tests under this project's fullyParallel config) means multiple
  // workers logging into this same shared account at once, which causes cross-test UI
  // interference on the backend -- a failure on one asset class that has nothing to do
  // with that asset class itself. A single sequential loop removes that risk entirely,
  // and each iteration's own try/catch keeps one asset class's failure from blocking
  // the rest.
  for (const slug of ASSET_GROUP_SLUGS) {
    try {
      const draftName = generateClubDealName();
      await dealFormPage.withPageRetry(clubDealCreateUrl(slug), async () => {
        await dealFormPage.fillClubDealDetails(draftName);
        await dealFormPage.saveAsDraft();
        await expect(page.getByText('Your deal has been saved as a draft.')).toBeVisible({ timeout: 15000 });
      });
      await dealFormPage.dismissConfirmationModal();

      recordDealResult(RESULTS_FILE, slug, { dealType: 'clubDeal', status: 'SUCCESS', draftName });
    } catch (err) {
      recordDealResult(RESULTS_FILE, slug, { dealType: 'clubDeal', status: 'FAILED', error: err.message });
    }
  }

  // Confirm a club deal was actually created for every asset class, not just that the loop ran.
  assertAllAssetGroupsCovered(RESULTS_FILE, ASSET_GROUP_SLUGS);
});
