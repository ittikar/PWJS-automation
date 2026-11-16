import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { LoginPage } from '../pages/loginpage.page';
import { DashboardPage } from '../pages/dashboardpage.page';
import { DealSearchPage } from '../pages/dealsearchpage.page';
import { DealViewPage } from '../pages/dealviewpage.page';

const RESULTS_FILE = path.join(process.cwd(), 'test-data', 'dueDiligenceResults.json');

const LOGIN_URL = 'https://sit-ireland-dashboard.ittikar.com/login';

// The asset group's own listing for a deal type ('portfolios' or 'opportunities').
function listingUrl(assetGroupSlug, dealTypePath) {
  return `https://sit-ireland-dashboard.ittikar.com/deals/${assetGroupSlug}/${dealTypePath}`;
}

// Login used to run due diligence -- change the email/password in test-data/dealUser.json.
const ROOT_USER = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'test-data', 'dealUser.json'), 'utf8'));
// Asset group slug -> the name the app shows for it in a deal's breadcrumb.
const ASSET_GROUPS = {
  'private-equity': 'Private Equity',
  'real-asset': 'Real Asset',
  'secondary-pre-ipo': 'Secondary & Pre-IPO',
  'private-credit': 'Private Credit',
  'other-alternatives': 'Other Alternatives',
};
const DEAL_TYPES = [
  { dealType: 'portfolio', listingPath: 'portfolios' },
  { dealType: 'opportunity', listingPath: 'opportunities' },
];

test('TC-REG-203', async ({ page }) => {
  // One login, then up to 10 search + run-due-diligence cycles (5 asset groups x 2 deal types).
  test.setTimeout(600000);

  const loginPage = new LoginPage(page);
  const dashboardPage = new DashboardPage(page);
  const dealSearchPage = new DealSearchPage(page);
  const dealViewPage = new DealViewPage(page);

  await loginPage.goto(LOGIN_URL);
  await loginPage.login(ROOT_USER.email, ROOT_USER.password);

  await dashboardPage.waitForLoad();
  await dashboardPage.dismissQuickTour();

  const results = [];

  // For every asset group, take the first Published portfolio/opportunity (if there is one)
  // and start due diligence on it. A group with nothing published is recorded as skipped,
  // not failed; each iteration's try/catch keeps one group's failure from blocking the rest.
  for (const { dealType, listingPath } of DEAL_TYPES) {
    for (const [slug, assetGroupName] of Object.entries(ASSET_GROUPS)) {
      const entry = { dealType, assetGroup: slug };
      let dealName;
      try {
        dealName = await dealSearchPage.findFirstDealWithStatus(listingUrl(slug, listingPath), 'Published');
        if (!dealName) {
          results.push({ ...entry, status: 'SKIPPED', reason: 'No Published deal in this asset group' });
          continue;
        }

        await dealSearchPage.openDeal(dealName);
        await expect(dealViewPage.dealHeading).toHaveText(dealName.toUpperCase(), { timeout: 15000 });
        // Guard against running due diligence on a deal from some other asset group. Deals created
        // with an asset class outside every group's list have no group in their breadcrumb at all
        // (e.g. "Portfolio · Special Situations"), so only fail when it names a different group.
        await expect(dealViewPage.breadcrumb).toBeVisible({ timeout: 15000 });
        const breadcrumb = (await dealViewPage.breadcrumb.textContent()).trim().toLowerCase();
        const otherGroup = Object.values(ASSET_GROUPS).find(
          name => name !== assetGroupName && breadcrumb.startsWith(`${name.toLowerCase()} · `)
        );
        expect(otherGroup, `Deal "${dealName}" belongs to ${otherGroup}, not ${assetGroupName}`).toBeUndefined();
        await dealViewPage.runDueDiligence();

        results.push({ ...entry, status: 'SUCCESS', dealName });
      } catch (err) {
        // Strip terminal colour codes so the error reads cleanly in the results file.
        const message = err.message.replace(/\u001b\[[0-9;]*m/g, '');
        results.push({ ...entry, status: 'FAILED', dealName, error: message.split('\n').slice(0, 4).join(' ') });
      }
    }
  }

  fs.writeFileSync(
    RESULTS_FILE,
    JSON.stringify(results.map(r => ({ ...r, timestamp: new Date().toISOString() })), null, 2)
  );

  for (const r of results.filter(r => r.status === 'SKIPPED')) {
    test.info().annotations.push({ type: 'skipped', description: `${r.dealType} / ${r.assetGroup}: ${r.reason}` });
  }

  const failed = results.filter(r => r.status === 'FAILED');
  expect(
    failed,
    `Due diligence could not be started for:\n${failed.map(r => `  - ${r.dealType} / ${r.assetGroup}: ${r.error}`).join('\n')}`
  ).toEqual([]);
});
