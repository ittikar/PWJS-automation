import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { SignupPage } from '../pages/signuppage.page';
import {generateUniqueEmail,generateUniqueOrgName,generateUniqueOrgRegNo,generateRandomCountry,} from '../utils/dataGenerator';
import { writeSignupResult as writeJsonResult } from '../utils/jsonWriter';
import { getOtpFromYopmail } from '../utils/otpReader';

const BASE_URL = 'https://sit-ireland-dashboard.ittikar.com/';
const LOGIN_URL = 'https://sit-ireland-dashboard.ittikar.com/login';

const signupData = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'test-data', 'signupData.json'), 'utf8'));
const user = signupData[0];

// In test suite -> TC-REG-001, TC-REG-014, TC-REG-021

test(`Signup Test -TC-REG-001, TC-REG-014, TC-REG-021`, async ({ page }) => {
  test.setTimeout(300000);

  const signupPage = new SignupPage(page);

  const email = generateUniqueEmail();
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

    const otp = await getOtpFromYopmail(page.context(), email);
    await signupPage.verifyEmail(otp);

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
  catch (err) {console.log(`Signup failed for ${username}: ${err.message}`);}

  expect(status).toBe('SUCCESS');
});
