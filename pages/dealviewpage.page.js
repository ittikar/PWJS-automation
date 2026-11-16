import { expect } from '@playwright/test';

// A single portfolio's or opportunity's own page (/deals/<type>/<id>/view).
export class DealViewPage {
  constructor(page) {
    this.page = page;

    this.dealHeading = page.locator('main').getByRole('heading', { level: 1 });
    // Breadcrumb above the name, e.g. "Private Equity · Portfolio · Search Funds".
    this.breadcrumb = page.locator('main p').filter({ hasText: ' · ' }).first();
    // Holds the reference code, location and current status, e.g. "... Tonga DD IN PROGRESS".
    this.statusLine = page.locator('main').getByRole('heading', { level: 6 }).first();
    // The header's button; a second one appears in the Due diligence section once a run exists.
    this.runDueDiligenceBtn = page.getByRole('button', { name: 'Run Due Diligence', exact: true }).first();
    this.runDueDiligenceDialog = page.getByRole('dialog', { name: 'Run due diligence?' });
    this.dueDiligenceRunningNotice = page.getByText(/Due diligence is running/i).first();
    this.confirmRunDueDiligenceBtn = this.runDueDiligenceDialog.getByRole('button', { name: 'Run due diligence', exact: true });

    // Shown to other organisations viewing a published club deal.
    this.requestDataRoomAccessBtn = page.getByRole('button', { name: 'Request Data Room Access', exact: true });
    this.accessRequestedBtn = page.getByRole('button', { name: 'Access Requested', exact: true });
    this.dialogOkBtn = page.getByRole('dialog').getByRole('button', { name: 'OK', exact: true });
  }

  // True when this viewer can still ask for access (not already requested or granted).
  async canRequestDataRoomAccess() {
    await this.dealHeading.waitFor({ state: 'visible', timeout: 30000 });
    return this.requestDataRoomAccessBtn.isEnabled({ timeout: 5000 }).catch(() => false);
  }

  // Sends the request straight away -- the app asks for no confirmation first.
  async requestDataRoomAccess() {
    await this.requestDataRoomAccessBtn.click({ timeout: 15000 });
    await expect(this.page.getByRole('dialog')).toContainText('Your request to access the data room has been submitted.', {
      timeout: 15000,
    });
    await this.dialogOkBtn.click({ timeout: 10000 });
    await expect(this.accessRequestedBtn).toBeDisabled({ timeout: 15000 });
  }

  // Starts due diligence and confirms it has begun. The run itself takes 10-15 minutes in the
  // background, so this only checks that the deal moves to DD In Progress and the button locks.
  async runDueDiligence() {
    await this.runDueDiligenceBtn.click({ timeout: 30000 });
    await expect(this.runDueDiligenceDialog).toBeVisible({ timeout: 10000 });
    await this.confirmRunDueDiligenceBtn.click({ timeout: 10000 });

    // Either signal means the run has started: the status in the header can lag behind (it has
    // stayed "Published" while the run was already going), and the page sometimes doesn't update
    // until its 60s auto-refresh -- so reload while waiting rather than relying on it.
    await expect(async () => {
      if (!(await this.isDueDiligenceRunning())) {
        await this.page.reload({ waitUntil: 'domcontentloaded' });
        await this.runDueDiligenceBtn.waitFor({ state: 'visible', timeout: 15000 });
        expect(await this.isDueDiligenceRunning(), 'Due diligence should be running').toBe(true);
      }
    }).toPass({ timeout: 120000, intervals: [5000, 10000] });
    await expect(this.runDueDiligenceBtn).toBeDisabled({ timeout: 15000 });
  }

  async isDueDiligenceRunning() {
    const statusInProgress = /DD In Progress/i.test(await this.statusLine.innerText().catch(() => ''));
    const runningNotice = await this.dueDiligenceRunningNotice.isVisible().catch(() => false);
    return statusInProgress || runningNotice;
  }
}
