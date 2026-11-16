import { expect } from '@playwright/test';

// "Data Room Requests" (/deals/dataroom-requests): the Received tab lists requests to see this
// organisation's deals (approve/reject there); the Sent tab lists its requests to see others'.
export class DataRoomRequestsPage {
  constructor(page) {
    this.page = page;

    this.receivedTab = page.getByRole('tab', { name: 'Received' });
    this.sentTab = page.getByRole('tab', { name: 'Sent' });
    this.dialog = page.getByRole('dialog');
    this.dialogOkBtn = this.dialog.getByRole('button', { name: 'OK', exact: true });
  }

  async goto(baseUrl) {
    await this.page.goto(`${baseUrl}/deals/dataroom-requests`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await this.receivedTab.waitFor({ state: 'visible', timeout: 30000 });
  }

  async openTab(tab) {
    await tab.click({ timeout: 15000 });
    await expect(tab).toHaveAttribute('aria-selected', 'true', { timeout: 10000 });
  }

  // A request's row: the nearest element around the deal's name that holds the row's buttons.
  // `withButton` narrows it to the row offering that action (a deal can have older rows too).
  requestRow(dealName, withButton = null) {
    const button = withButton ? `[normalize-space()="${withButton}"]` : '';
    return this.page
      .locator('main')
      .getByText(dealName, { exact: true })
      .locator(`xpath=ancestor::*[.//button${button}][1]`)
      .first();
  }

  // Owner side, Received tab: approves the pending request for this deal.
  async approveRequest(dealName) {
    const row = this.requestRow(dealName, 'Approve');
    await row.getByRole('button', { name: 'Approve', exact: true }).click({ timeout: 30000 });
    await expect(this.dialog).toContainText('Access request approved successfully.', { timeout: 15000 });
    await this.dialogOkBtn.click({ timeout: 10000 });
  }

  // Waits for the deal's row to show the given status ("Can view" on the owner's Received tab,
  // "You can view" on the requester's Sent tab), reloading in case the list was stale.
  async expectRequestStatus(baseUrl, tab, dealName, status) {
    await expect(async () => {
      await this.goto(baseUrl);
      await this.openTab(tab);
      await expect(this.requestRow(dealName, 'View data room')).toContainText(status, { timeout: 10000 });
    }).toPass({ timeout: 60000, intervals: [3000, 5000] });
  }
}
