import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { LoginPage } from '../pages/loginpage.page';
import { DashboardPage } from '../pages/dashboardpage.page';
import { OnboardingChatPage } from '../pages/onboardingchatpage.page';
import { KybVerificationPage } from '../pages/kybverificationpage.page';
import { approveApplicant, getApplicant } from '../utils/sumsubApi';

const LOGIN_URL = 'https://sit-ireland-dashboard.ittikar.com/login';

// What to enter in the company verification (Sumsub) widget.
const KYB_DATA = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'test-data', 'kybData.json'), 'utf8'));

function getLatestSuccessfulSignup() {
  const signupResults = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), 'test-data', 'signupResults.json'), 'utf8')
  );

  const successfulSignups = signupResults.filter(entry => entry.status === 'SUCCESS');
  return successfulSignups[successfulSignups.length - 1];
}

test('TC-REG-074', async ({ page, request }) => {
  // Onboarding chat, then the whole company verification widget and the approval.
  test.setTimeout(600000);

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

  // Itti doesn't always render the form on its first reply, so keep answering positively until it does.
  const formVisible = await onboardingChatPage.waitForAumFormRespondingPositively();

  expect(formVisible, 'AUM form (currency, AUM Lower Limit, AUM Upper Limit) should be visible').toBe(true);

  await onboardingChatPage.fillAumDetails({ lowerLimit: '1M', upperLimit: '10M', currencyCode: 'USD' });
  await onboardingChatPage.saveAumDetails();

  await expect(onboardingChatPage.aumRangeConfirmation('USD')).toHaveText('AUM Range: 1,000,000 – 10,000,000 USD', {
    timeout: 30000,
  });
  await expect(onboardingChatPage.saveAumBtn).toBeDisabled();

  const verificationPrompted = await onboardingChatPage.confirmAndSubmitAum();
  expect(verificationPrompted, 'Start Verification prompt should appear after Confirm and Submit').toBe(true);
  await expect(onboardingChatPage.startVerificationBtn).toBeVisible();
  await expect(onboardingChatPage.remindMeLaterBtn).toBeVisible();

  // The widget's start-up call returns the Sumsub applicant ID for this organisation.
  const widgetInit = page.waitForResponse(r => r.url().includes('/resources/sdkIntegrations/websdkInit'), {
    timeout: 120000,
  });
  await onboardingChatPage.startVerificationBtn.click();

  const kybPage = new KybVerificationPage(page);
  await kybPage.confirmAumStepIfShown({ lowerLimit: '1000000', upperLimit: '10000000', currency: 'USD' });

  const { applicantId } = await (await widgetInit).json();
  expect(applicantId, 'Sumsub applicant ID from the widget').toBeTruthy();
  console.log(`Sumsub applicantId: ${applicantId}`);
  test.info().annotations.push({ type: 'applicantId', description: applicantId });

  await kybPage.acceptIntro(KYB_DATA.residence);
  await kybPage.confirmCompanyData({ companyName: user.orgName, entityType: KYB_DATA.companyEntityType });
  await kybPage.uploadCompanyDocuments(KYB_DATA.documents);
  await kybPage.addIndividual(KYB_DATA.beneficiary);
  await kybPage.submit({ trusteeCannotBeIdentified: KYB_DATA.trusteeCannotBeIdentified });

  // The beneficiary's own identity check (ID and live selfie) can't be automated, so approve the
  // company applicant through the Sumsub API instead, then confirm Sumsub reports it approved.
  await approveApplicant(request, applicantId);
  await expect(async () => {
    const applicant = await getApplicant(request, applicantId);
    expect(applicant.review?.reviewResult?.reviewAnswer, `Review of applicant ${applicantId}`).toBe('GREEN');
  }).toPass({ timeout: 60000, intervals: [5000] });
});
