import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { LoginPage } from '../pages/loginpage.page';
import { DashboardPage } from '../pages/dashboardpage.page';
import { DealFormPage } from '../pages/dealformpage.page';
import { DealSearchPage } from '../pages/dealsearchpage.page';
import { KybVerificationPage } from '../pages/kybverificationpage.page';
import { approveApplicant, getApplicant } from '../utils/sumsubApi';
import { generateClubDealName } from '../utils/dataGenerator';
import { pickRandomFiles } from '../utils/dealForm';
import { resetDealResults, recordDealResult, assertAllAssetGroupsCovered, logCreatedDeals } from '../utils/dealResults';

const RESULTS_FILE = 'clubDealResults.json';

// What to enter for the participant and in its company verification (Sumsub) widget.
const KYB_DATA = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'test-data', 'kybData.json'), 'utf8'));

const LOGIN_URL = 'https://sit-ireland-dashboard.ittikar.com/login';

function clubDealCreateUrl(assetGroupSlug) {
  return `https://sit-ireland-dashboard.ittikar.com/deals/create/details?assetGroup=${assetGroupSlug}`;
}

// The asset group's own club deal listing, where the created deals should show up.
function clubDealListingUrl(assetGroupSlug) {
  return `https://sit-ireland-dashboard.ittikar.com/deals/${assetGroupSlug}/club-deal`;
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

async function createClubDealPair(dealFormPage, slug) {
  // Club deal 1: save as a draft.
  const draftName = generateClubDealName();
  await dealFormPage.withPageRetry(clubDealCreateUrl(slug), async () => {
    await dealFormPage.fillClubDealDetails(draftName);
    await dealFormPage.saveAsDraft();
    await expect(dealFormPage.page.getByText('Your deal has been saved as a draft.')).toBeVisible({
      timeout: 15000,
    });
  });
  await dealFormPage.expectSavedInAssetGroup(slug);
  await dealFormPage.dismissConfirmationModal();

  // Club deal 2: save (not as a draft), skip the participants step, upload documents, and
  // submit it fully. Club deals have an extra "People and Organisations" step between Deal
  // Details and Data Room Documents that portfolio/opportunity don't have.
  const submittedName = generateClubDealName();
  await dealFormPage.withPageRetry(clubDealCreateUrl(slug), async () => {
    await dealFormPage.fillClubDealDetails(submittedName);
    await dealFormPage.saveAndContinue();
    await expect(dealFormPage.page).toHaveURL(/\/participants\?flow=create/, { timeout: 15000 });
    await dealFormPage.skipParticipants();
    await expect(dealFormPage.page).toHaveURL(/\/documents\?flow=create/, { timeout: 15000 });
  });
  await dealFormPage.expectSavedInAssetGroup(slug);

  await dealFormPage.reloadDataRoom();

  const files = pickRandomFiles(2);
  await dealFormPage.uploadFiles(files);
  await dealFormPage.waitForUploadsComplete(files);

  await dealFormPage.submit();

  await expect(dealFormPage.page.getByText('Submit deal?')).toBeVisible({ timeout: 10000 });
  await dealFormPage.dismissConfirmationModal();

  await expect(dealFormPage.page.getByText('Your deal has been submitted successfully.')).toBeVisible({
    timeout: 15000,
  });
  await dealFormPage.dismissConfirmationModal();

  return { draftName, submittedName };
}

// Club deal 3: submitted with a participant organisation, whose company verification is done in
// the Sumsub widget and then approved through the Sumsub API (the beneficiary's own ID and selfie
// check can't be automated). Checks Sumsub approved it and the app linked the participant to it.
async function createParticipantClubDeal(dealFormPage, request, participantsCalls, slug) {
  const page = dealFormPage.page;
  const dealName = generateClubDealName();
  const stamp = String(Date.now());
  const participantData = {
    companyName: `${KYB_DATA.participant.companyNamePrefix} ${stamp}`,
    country: KYB_DATA.participant.country,
    registrationNumber: KYB_DATA.participant.registrationNumberPrefix + stamp.slice(-6),
  };

  await dealFormPage.withPageRetry(clubDealCreateUrl(slug), async () => {
    await dealFormPage.fillClubDealDetails(dealName);
    await dealFormPage.saveAndContinue();
    await expect(page).toHaveURL(/\/participants\?flow=create/, { timeout: 15000 });
  });
  await dealFormPage.expectSavedInAssetGroup(slug);

  const participant = await dealFormPage.addParticipant(participantData);
  expect(participant.status, 'New participant status').toBe('KYB_PENDING');
  await expect(page.getByText('KYB Pending')).toBeVisible();
  await dealFormPage.continueFromParticipants();
  await expect(page).toHaveURL(/\/documents\?flow=create/, { timeout: 15000 });

  await dealFormPage.reloadDataRoom();
  const files = pickRandomFiles(2);
  await dealFormPage.uploadFiles(files);
  await dealFormPage.waitForUploadsComplete(files);
  await dealFormPage.submit();
  await expect(page.getByText('Submit deal?')).toBeVisible({ timeout: 10000 });
  await dealFormPage.dismissConfirmationModal();

  // With a participant, submitting offers to verify it straight away; that opens the Sumsub widget.
  await expect(page.getByText('Would you like to verify the participant now?')).toBeVisible({ timeout: 15000 });
  const widgetInit = page.waitForResponse(r => r.url().includes('/resources/sdkIntegrations/websdkInit'), {
    timeout: 120000,
  });
  await page.getByRole('dialog').getByRole('button', { name: 'Yes' }).click();
  const { applicantId } = await (await widgetInit).json();
  expect(applicantId, 'Sumsub applicant ID from the widget').toBeTruthy();

  const kybPage = new KybVerificationPage(page);
  await kybPage.acceptIntro(KYB_DATA.residence);
  await kybPage.confirmCompanyData({ companyName: participantData.companyName, entityType: KYB_DATA.companyEntityType });
  await kybPage.uploadCompanyDocuments(KYB_DATA.documents);
  await kybPage.addIndividual(KYB_DATA.beneficiary);
  await kybPage.submit({ trusteeCannotBeIdentified: KYB_DATA.trusteeCannotBeIdentified });

  // Sumsub: the applicant is this participant (company, same name), and is approved.
  const applicant = await getApplicant(request, applicantId);
  expect(applicant.externalUserId, 'Sumsub applicant belongs to the participant').toBe(participant.id);
  expect(applicant.fixedInfo?.companyInfo?.companyName ?? applicant.info?.companyInfo?.companyName).toBe(
    participantData.companyName
  );
  await approveApplicant(request, applicantId);
  await expect(async () => {
    const approved = await getApplicant(request, applicantId);
    expect(approved.review?.reviewResult?.reviewAnswer, `Review of applicant ${applicantId}`).toBe('GREEN');
  }).toPass({ timeout: 60000, intervals: [5000] });

  // The app: the participant is linked to that Sumsub applicant and its verification is submitted
  // (it stays KYB_SUBMITTED after approval, as Sumsub still waits for the beneficiary's own check).
  // Read by replaying the app's own participants call for this deal.
  const participantsCall = participantsCalls.get(participant.dealComplianceId);
  expect(participantsCall, "the app's participants call for this deal").toBeTruthy();
  let participantStatus;
  await expect(async () => {
    const response = await page.request.get(participantsCall.url, { headers: participantsCall.headers });
    expect(response.ok()).toBe(true);
    const saved = (await response.json()).find(p => p.id === participant.id);
    expect(saved?.complianceProviderId, 'participant linked to the Sumsub applicant').toBe(applicantId);
    expect(saved?.status, 'participant status').toBe('KYB_SUBMITTED');
    participantStatus = saved.status;
  }).toPass({ timeout: 60000, intervals: [5000] });

  return { dealName, participantCompany: participantData.companyName, applicantId, participantStatus };
}

test('TC-REG-168', async ({ page, request }) => {
  // Per asset group: a draft, a submitted deal, and a submitted deal with a verified participant.
  test.setTimeout(1800000);

  const loginPage = new LoginPage(page);
  const dashboardPage = new DashboardPage(page);
  const dealFormPage = new DealFormPage(page);
  const dealSearchPage = new DealSearchPage(page);

  // The app's own participants call per deal, replayed to read a participant's status.
  const participantsCalls = new Map();
  page.on('request', r => {
    const dealId = r.url().match(/deals-compliance\/([^/?]+)\/participants(\?|$)/)?.[1];
    if (r.method() === 'GET' && dealId) participantsCalls.set(dealId, { url: r.url(), headers: r.headers() });
  });

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
    const result = { dealType: 'clubDeal' };
    const errors = [];
    try {
      Object.assign(result, await createClubDealPair(dealFormPage, slug));
    } catch (err) {
      errors.push(`draft/submitted pair: ${err.message}`);
    }
    try {
      const withParticipant = await createParticipantClubDeal(dealFormPage, request, participantsCalls, slug);
      Object.assign(result, {
        participantDealName: withParticipant.dealName,
        participantCompany: withParticipant.participantCompany,
        participantApplicantId: withParticipant.applicantId,
        participantKybStatus: withParticipant.participantStatus,
      });
    } catch (err) {
      errors.push(`deal with participant: ${err.message}`);
    }

    // The confirmation messages alone aren't proof: only count the deals as created once they
    // are actually listed under this asset group, with the expected draft/submitted status.
    try {
      if (result.draftName && result.submittedName) {
        const uiCheck = await dealSearchPage.verifyDealPair(clubDealListingUrl(slug), {
          draftName: result.draftName,
          submittedName: result.submittedName,
        });
        Object.assign(result, { draftStatus: uiCheck.draftStatus, submittedStatus: uiCheck.submittedStatus });
        if (!uiCheck.ok) errors.push(uiCheck.error);
      }
      if (result.participantDealName) {
        const uiCheck = await dealSearchPage.verifySubmittedDeal(clubDealListingUrl(slug), result.participantDealName);
        result.participantDealStatus = uiCheck.status;
        if (!uiCheck.ok) errors.push(uiCheck.error);
      }
    } catch (err) {
      errors.push(`listing check: ${err.message}`);
    }

    // Record the result (or failure) and keep going, so one asset group's problem doesn't prevent
    // the rest from being attempted; the final coverage check still reports it.
    recordDealResult(RESULTS_FILE, slug, {
      ...result,
      status: errors.length === 0 ? 'SUCCESS' : 'FAILED',
      error: errors.join('; ') || undefined,
    });
  }

  // Confirm all three club deals were actually created for every asset class, not just that the loop ran.
  assertAllAssetGroupsCovered(RESULTS_FILE, ASSET_GROUP_SLUGS);
  logCreatedDeals(RESULTS_FILE);
});
