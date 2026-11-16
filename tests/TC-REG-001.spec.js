import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { SignupPage } from '../pages/signuppage.page';
import {generateUniqueEmail,generateUniqueOrgName,generateUniqueOrgRegNo,generateRandomCountry,} from '../utils/dataGenerator';
import { writeSignupResult as writeJsonResult } from '../utils/jsonWriter';

const BASE_URL = 'https://sit-ireland-dashboard.ittikar.com/';
const LOGIN_URL = 'https://sit-ireland-dashboard.ittikar.com/login';

// How long the test waits for the OTP to be typed in by hand.
const MANUAL_OTP_TIMEOUT_MS = 5 * 60 * 1000;

// The OTP is entered by hand (YOPmail's "Verify you are human" check blocks reading it
// automatically), so the browser must be visible even without --headed.
test.use({ headless: false });

const signupData = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'test-data', 'signupData.json'), 'utf8'));
const user = signupData[0];

// In test suite -> TC-REG-001, TC-REG-014, TC-REG-021

test(`Signup Test -TC-REG-001, TC-REG-014, TC-REG-021`, async ({ page }) => {
  // The usual signup steps plus up to MANUAL_OTP_TIMEOUT_MS waiting for the OTP.
  test.setTimeout(MANUAL_OTP_TIMEOUT_MS + 120000);

  const signupPage = new SignupPage(page);

  const email = generateUniqueEmail();
  console.log(`Signing up with email: ${email}`);
  test.info().annotations.push({ type: 'signup email', description: email });
  const orgName = generateUniqueOrgName();
  const orgRegNo = generateUniqueOrgRegNo();
  const country = generateRandomCountry();
  const username = `${user.username}_${Date.now()}`;
  let status = 'FAILED';

  try {
    await signupPage.goto(BASE_URL);
    await signupPage.clickCreateAccount();

    await signupPage.fillForm({ ...user, email, orgName, orgRegNo });
    await signupPage.selectCountry(country);

    await signupPage.proceed();

    const inboxUrl = `https://yopmail.com/en/?login=${email.split('@')[0]}`;
    console.log(
      `\nEnter the OTP manually in the browser window.\n` +
        `  Email: ${email}\n` +
        `  Inbox: ${inboxUrl}\n` +
        `Waiting up to ${MANUAL_OTP_TIMEOUT_MS / 60000} minutes...\n`
    );
    await signupPage.waitForManualEmailVerification(MANUAL_OTP_TIMEOUT_MS);

    status = 'SUCCESS';

    const result = {
      username,
      email,
      password: user.password,
      firstName: user.firstName,
      lastName: user.lastName,
      orgName,
      orgRegNo,
      country,
      status,
      timestamp: new Date().toISOString(),
    };

    writeJsonResult('signupResults.json', result);

    await signupPage.goto(LOGIN_URL);
  } 
  catch (err) {console.log(`Signup failed for ${username} (${email}): ${err.message}`);}

  expect(status).toBe('SUCCESS');
});
