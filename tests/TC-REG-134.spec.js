import { test, expect } from '@playwright/test';
import path from 'path';
import { LoginPage } from '../pages/loginpage.page';
import { generatePortfolioName } from '../utils/dataGenerator';
import { fillDealDetails, pickRandomFiles } from '../utils/dealForm';

const LOGIN_URL = 'https://sit-ireland-dashboard.ittikar.com/login';

function portfolioCreateUrl(assetGroupSlug) {
  return `https://sit-ireland-dashboard.ittikar.com/deals/portfolios/create/details?assetGroup=${assetGroupSlug}`;
}

const ROOT_USER = {
  email: 'yoprutettokau-3986@yopmail.com',
  password: 'Qwerty@123',
};

const ASSET_GROUPS = [
  { slug: 'private-equity', label: 'Private Equity' },
  { slug: 'real-asset', label: 'Real Asset' },
  { slug: 'secondary-pre-ipo', label: 'Secondary & Pre-IPO' },
  { slug: 'private-credit', label: 'Private Credit' },
  { slug: 'other-alternatives', label: 'Other Alternatives' },
];

for (const { slug, label } of ASSET_GROUPS) {
  test(`TC-REG-134 - ${label}`, async ({ page }) => {
    const loginPage = new LoginPage(page);

    await loginPage.goto(LOGIN_URL);
    await loginPage.login(ROOT_USER.email, ROOT_USER.password);

    await page.waitForURL(url => url.pathname.startsWith('/itti'), { timeout: 45000 });

    // Dismiss the first-login "Quick tour" prompt if it appears.
    await page.getByRole('button', { name: 'Not now' }).click({ timeout: 5000 }).catch(() => {});

    // Portfolio 1: save as a draft.
    await page.goto(portfolioCreateUrl(slug));
    await fillDealDetails(page, generatePortfolioName());
    await page.getByRole('button', { name: 'Save as Draft' }).click();

    await expect(page.getByText('Your portfolio has been saved as a draft.')).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: 'OK', exact: true }).click();

    // Portfolio 2: save (not as a draft), upload documents, and submit it fully.
    await page.goto(portfolioCreateUrl(slug));
    await fillDealDetails(page, generatePortfolioName());
    await page.getByRole('button', { name: 'Save & Continue' }).click();

    await expect(page).toHaveURL(/\/documents\?flow=create/, { timeout: 15000 });

    // The Data Room widget can get stuck on "LOADING DATA ROOM…" after the create-flow
    // transition; a reload reliably gets it to render its upload categories.
    await page.reload({ waitUntil: 'networkidle' });

    const [file1, file2] = pickRandomFiles(2);
    await page.locator('input[type="file"]').first().setInputFiles([file1, file2]);

    // The upload progress indicator is transient, so wait for the filenames themselves
    // (which persist both during and after upload) and then for the percentage indicators
    // to clear, which is how this widget signals that uploads have actually finished.
    await expect(page.getByText(path.basename(file1))).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(path.basename(file2))).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('100%')).toHaveCount(0, { timeout: 30000 });

    await page.getByRole('button', { name: 'Submit', exact: true }).click();

    await expect(page.getByText('Submit portfolio?')).toBeVisible({ timeout: 10000 });
    await page.getByRole('button', { name: 'OK', exact: true }).click();

    await expect(page.getByText('Your portfolio has been submitted successfully.')).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole('button', { name: 'OK', exact: true }).click();
  });
}
