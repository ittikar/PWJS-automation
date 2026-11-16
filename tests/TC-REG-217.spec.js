import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { LoginPage } from '../pages/loginpage.page';
import { DashboardPage } from '../pages/dashboardpage.page';
import { DealSearchPage } from '../pages/dealsearchpage.page';
import { DealViewPage } from '../pages/dealviewpage.page';
import { DataRoomRequestsPage } from '../pages/dataroomrequestspage.page';

const RESULTS_FILE = path.join(process.cwd(), 'test-data', 'dataRoomRequestResults.json');

const BASE_URL = 'https://sit-ireland-dashboard.ittikar.com';
const LOGIN_URL = `${BASE_URL}/login`;

// The asset group's own club deal listing.
function clubDealListingUrl(assetGroupSlug) {
  return `${BASE_URL}/deals/${assetGroupSlug}/club-deal`;
}

// The owner publishes the club deals (the same login TC-REG-168 creates them with) and approves
// the requests; the requester, from a different organisation, asks to see their data rooms.
// Change either email/password in test-data/dealUser.json or test-data/dataRoomRequester.json.
const OWNER = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'test-data', 'dealUser.json'), 'utf8'));
const REQUESTER = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'test-data', 'dataRoomRequester.json'), 'utf8'));
const ASSET_GROUP_SLUGS = [
  'private-equity',
  'real-asset',
  'secondary-pre-ipo',
  'private-credit',
  'other-alternatives',
];

async function loginAs(page, user) {
  const loginPage = new LoginPage(page);
  const dashboardPage = new DashboardPage(page);
  await loginPage.goto(LOGIN_URL);
  await loginPage.login(user.email, user.password);
  await dashboardPage.waitForLoad();
  await dashboardPage.dismissQuickTour();
}

// Picks the first of the owner's Published club deals in this asset group that the requester
// hasn't already asked for, and sends the request. Returns the deal's name, or null if none.
async function requestOneDataRoom(ownerSearch, ownerPage, requesterView, requesterPage, slug) {
  const listingUrl = clubDealListingUrl(slug);
  const candidates = await ownerSearch.findOwnDealsWithStatus(listingUrl, 'Published');

  for (const name of candidates) {
    // The requester can't search other organisations' deals, so open it by the owner's link.
    await ownerSearch.findDeal(listingUrl, name);
    await ownerSearch.openDeal(name);
    const dealUrl = ownerPage.url();

    await requesterPage.goto(dealUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await expect(requesterView.dealHeading).toHaveText(name.toUpperCase(), { timeout: 30000 });
    if (!(await requesterView.canRequestDataRoomAccess())) continue;

    await requesterView.requestDataRoomAccess();
    return name;
  }
  return null;
}

test('TC-REG-217', async ({ page, browser }) => {
  // Two logins, then per asset group: a search, opening a few deals, a request and an approval.
  test.setTimeout(600000);

  expect(REQUESTER.email, 'Requester and owner must be different accounts').not.toBe(OWNER.email);

  const ownerPage = page;
  const requesterContext = await browser.newContext();
  const requesterPage = await requesterContext.newPage();

  try {
    await loginAs(ownerPage, OWNER);
    await loginAs(requesterPage, REQUESTER);

    const ownerSearch = new DealSearchPage(ownerPage);
    const ownerRequests = new DataRoomRequestsPage(ownerPage);
    const requesterView = new DealViewPage(requesterPage);
    const requesterRequests = new DataRoomRequestsPage(requesterPage);

    const results = [];

    // Each asset group runs request -> approve -> confirm on both sides before the next one;
    // its own try/catch keeps one group's failure from blocking the rest.
    for (const slug of ASSET_GROUP_SLUGS) {
      const entry = { assetGroup: slug };
      let dealName;
      try {
        dealName = await requestOneDataRoom(ownerSearch, ownerPage, requesterView, requesterPage, slug);
        if (!dealName) {
          results.push({ ...entry, status: 'SKIPPED', reason: 'No Published club deal of the owner left to request' });
          continue;
        }

        await ownerRequests.goto(BASE_URL);
        await ownerRequests.openTab(ownerRequests.receivedTab);
        await ownerRequests.approveRequest(dealName);
        await ownerRequests.expectRequestStatus(BASE_URL, ownerRequests.receivedTab, dealName, 'Can view');

        await requesterRequests.expectRequestStatus(BASE_URL, requesterRequests.sentTab, dealName, 'You can view');

        results.push({ ...entry, status: 'SUCCESS', dealName });
      } catch (err) {
        // Strip terminal colour codes so the error reads cleanly in the results file.
        const message = err.message.replace(/\u001b\[[0-9;]*m/g, '');
        results.push({ ...entry, status: 'FAILED', dealName, error: message.split('\n').slice(0, 4).join(' ') });
      }
    }

    fs.writeFileSync(
      RESULTS_FILE,
      JSON.stringify(results.map(r => ({ ...r, timestamp: new Date().toISOString() })), null, 2)
    );

    for (const r of results.filter(r => r.status === 'SKIPPED')) {
      test.info().annotations.push({ type: 'skipped', description: `${r.assetGroup}: ${r.reason}` });
    }

    const failed = results.filter(r => r.status === 'FAILED');
    expect(
      failed,
      `Data room request/approval failed for:\n${failed.map(r => `  - ${r.assetGroup}: ${r.error}`).join('\n')}`
    ).toEqual([]);
  } finally {
    await requesterContext.close();
  }
});
