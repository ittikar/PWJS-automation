import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/loginpage.page';
import { DashboardPage } from '../pages/dashboardpage.page';
import { DealFormPage } from '../pages/dealformpage.page';
import { generatePortfolioName } from '../utils/dataGenerator';
import { pickRandomFiles } from '../utils/dealForm';
import { resetDealResults, recordDealResult, assertAllAssetGroupsCovered } from '../utils/dealResults';

const RESULTS_FILE = 'portfolioResults.json';

const LOGIN_URL = 'https://sit-ireland-dashboard.ittikar.com/login';

function portfolioCreateUrl(assetGroupSlug) {
  return `https://sit-ireland-dashboard.ittikar.com/deals/portfolios/create/details?assetGroup=${assetGroupSlug}`;
}

const ROOT_USER = { email: 'sasottijotro-8363@yopmail.com', password: 'Qwerty@123' };
const ASSET_GROUP_SLUGS = [
  'private-equity',
  'real-asset',
  'secondary-pre-ipo',
  'private-credit',
  'other-alternatives',
];

async function createPortfolioPair(dealFormPage, slug) {
  // Portfolio 1: save as a draft.
  const draftName = generatePortfolioName();
  await dealFormPage.withPageRetry(portfolioCreateUrl(slug), async () => {
    await dealFormPage.fillDealDetails(draftName);
    await dealFormPage.saveAsDraft();
    await expect(dealFormPage.page.getByText('Your portfolio has been saved as a draft.')).toBeVisible({
      timeout: 15000,
    });
  });
  await dealFormPage.dismissConfirmationModal();

  // Portfolio 2: save (not as a draft), upload documents, and submit it fully.
  const submittedName = generatePortfolioName();
  await dealFormPage.withPageRetry(portfolioCreateUrl(slug), async () => {
    await dealFormPage.fillDealDetails(submittedName);
    await dealFormPage.saveAndContinue();
    await expect(dealFormPage.page).toHaveURL(/\/documents\?flow=create/, { timeout: 15000 });
  });

  await dealFormPage.reloadDataRoom();

  const files = pickRandomFiles(2);
  await dealFormPage.uploadFiles(files);
  await dealFormPage.waitForUploadsComplete(files);

  await dealFormPage.submit();

  await expect(dealFormPage.page.getByText('Submit portfolio?')).toBeVisible({ timeout: 10000 });
  await dealFormPage.dismissConfirmationModal();

  await expect(dealFormPage.page.getByText('Your portfolio has been submitted successfully.')).toBeVisible({
    timeout: 15000,
  });
  await dealFormPage.dismissConfirmationModal();

  return { draftName, submittedName };
}

test('TC-REG-134', async ({ page }) => {
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

  for (const slug of ASSET_GROUP_SLUGS) {
    try {
      const { draftName, submittedName } = await createPortfolioPair(dealFormPage, slug);
      recordDealResult(RESULTS_FILE, slug, { dealType: 'portfolio', status: 'SUCCESS', draftName, submittedName });
    } catch (err) {
      // Record the failure and keep going, so one asset group's problem doesn't prevent
      // the rest from being attempted; the final coverage check still reports it.
      recordDealResult(RESULTS_FILE, slug, { dealType: 'portfolio', status: 'FAILED', error: err.message });
    }
  }

  // Confirm a portfolio was actually created for every asset class, not just that the loop ran.
  assertAllAssetGroupsCovered(RESULTS_FILE, ASSET_GROUP_SLUGS);
});
