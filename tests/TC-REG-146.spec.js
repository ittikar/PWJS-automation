import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/loginpage.page';
import { DashboardPage } from '../pages/dashboardpage.page';
import { DealFormPage } from '../pages/dealformpage.page';
import { generateOpportunityName } from '../utils/dataGenerator';
import { pickRandomFiles } from '../utils/dealForm';
import { resetDealResults, recordDealResult, assertAllAssetGroupsCovered } from '../utils/dealResults';

const RESULTS_FILE = 'opportunityResults.json';

const LOGIN_URL = 'https://sit-ireland-dashboard.ittikar.com/login';

function opportunityCreateUrl(assetGroupSlug) {
  return `https://sit-ireland-dashboard.ittikar.com/deals/opportunities/create/details?assetGroup=${assetGroupSlug}`;
}

const ROOT_USER = { email: 'sasottijotro-8363@yopmail.com', password: 'Qwerty@123' };
const ASSET_GROUP_SLUGS = [
  'private-equity',
  'real-asset',
  'secondary-pre-ipo',
  'private-credit',
  'other-alternatives',
];

async function createOpportunityPair(dealFormPage, slug) {
  // Opportunity 1: save as a draft.
  const draftName = generateOpportunityName();
  await dealFormPage.withPageRetry(opportunityCreateUrl(slug), async () => {
    await dealFormPage.fillDealDetails(draftName);
    await dealFormPage.saveAsDraft();
    await expect(dealFormPage.page.getByText('Your opportunity has been saved as a draft.')).toBeVisible({
      timeout: 15000,
    });
  });
  await dealFormPage.dismissConfirmationModal();

  // Opportunity 2: save (not as a draft), upload documents, and submit it fully.
  const submittedName = generateOpportunityName();
  await dealFormPage.withPageRetry(opportunityCreateUrl(slug), async () => {
    await dealFormPage.fillDealDetails(submittedName);
    await dealFormPage.saveAndContinue();
    await expect(dealFormPage.page).toHaveURL(/\/documents\?flow=create/, { timeout: 15000 });
  });

  await dealFormPage.reloadDataRoom();

  const files = pickRandomFiles(2);
  await dealFormPage.uploadFiles(files);
  await dealFormPage.waitForUploadsComplete(files);

  await dealFormPage.submit();

  await expect(dealFormPage.page.getByText('Submit opportunity?')).toBeVisible({ timeout: 10000 });
  await dealFormPage.dismissConfirmationModal();

  await expect(dealFormPage.page.getByText('Your opportunity has been submitted successfully.')).toBeVisible({
    timeout: 15000,
  });
  await dealFormPage.dismissConfirmationModal();

  return { draftName, submittedName };
}

test('TC-REG-146', async ({ page }) => {
  // This test does a single login followed by 5 full asset-group create+submit cycles,
  // which comfortably exceeds the project's 90s default test timeout even on a clean run.
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
      const { draftName, submittedName } = await createOpportunityPair(dealFormPage, slug);
      recordDealResult(RESULTS_FILE, slug, { dealType: 'opportunity', status: 'SUCCESS', draftName, submittedName });
    } catch (err) {
      recordDealResult(RESULTS_FILE, slug, { dealType: 'opportunity', status: 'FAILED', error: err.message });
    }
  }

  // Confirm an opportunity was actually created for every asset class, not just that the loop ran.
  assertAllAssetGroupsCovered(RESULTS_FILE, ASSET_GROUP_SLUGS);
});
