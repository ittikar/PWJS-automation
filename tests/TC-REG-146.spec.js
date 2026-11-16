import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { LoginPage } from '../pages/loginpage.page';
import { DashboardPage } from '../pages/dashboardpage.page';
import { DealFormPage } from '../pages/dealformpage.page';
import { DealSearchPage } from '../pages/dealsearchpage.page';
import { generateOpportunityName } from '../utils/dataGenerator';
import { pickRandomFiles } from '../utils/dealForm';
import { resetDealResults, recordDealResult, assertAllAssetGroupsCovered, logCreatedDeals } from '../utils/dealResults';

const RESULTS_FILE = 'opportunityResults.json';

const LOGIN_URL = 'https://sit-ireland-dashboard.ittikar.com/login';

function opportunityCreateUrl(assetGroupSlug) {
  return `https://sit-ireland-dashboard.ittikar.com/deals/opportunities/create/details?assetGroup=${assetGroupSlug}`;
}

// The asset group's own opportunity listing, where the created deals should show up.
function opportunityListingUrl(assetGroupSlug) {
  return `https://sit-ireland-dashboard.ittikar.com/deals/${assetGroupSlug}/opportunities`;
}

// Login used to create the deals -- change the email/password in test-data/dealUser.json.
const ROOT_USER = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'test-data', 'dealUser.json'), 'utf8'));
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
  await dealFormPage.expectSavedInAssetGroup(slug);
  await dealFormPage.dismissConfirmationModal();

  // Opportunity 2: save (not as a draft), upload documents, and submit it fully.
  const submittedName = generateOpportunityName();
  await dealFormPage.withPageRetry(opportunityCreateUrl(slug), async () => {
    await dealFormPage.fillDealDetails(submittedName);
    await dealFormPage.saveAndContinue();
    await expect(dealFormPage.page).toHaveURL(/\/documents\?flow=create/, { timeout: 15000 });
  });
  await dealFormPage.expectSavedInAssetGroup(slug);

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
  // This test does a single login followed by 5 full asset-group create+submit cycles, each
  // followed by a search of the listing to confirm both deals show up there (retried when a
  // deal isn't found yet), which comfortably exceeds the project's default test timeout.
  test.setTimeout(600000);

  const loginPage = new LoginPage(page);
  const dashboardPage = new DashboardPage(page);
  const dealFormPage = new DealFormPage(page);
  const dealSearchPage = new DealSearchPage(page);

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

      // The confirmation messages alone aren't proof: only count the pair as created once both
      // deals are actually listed under this asset group, with the expected draft/submitted status.
      const uiCheck = await dealSearchPage.verifyDealPair(opportunityListingUrl(slug), { draftName, submittedName });
      recordDealResult(RESULTS_FILE, slug, {
        dealType: 'opportunity',
        status: uiCheck.ok ? 'SUCCESS' : 'FAILED',
        draftName,
        submittedName,
        draftStatus: uiCheck.draftStatus,
        submittedStatus: uiCheck.submittedStatus,
        error: uiCheck.error,
      });
    } catch (err) {
      recordDealResult(RESULTS_FILE, slug, { dealType: 'opportunity', status: 'FAILED', error: err.message });
    }
  }

  // Confirm an opportunity was actually created for every asset class, not just that the loop ran.
  assertAllAssetGroupsCovered(RESULTS_FILE, ASSET_GROUP_SLUGS);
  logCreatedDeals(RESULTS_FILE);
});
