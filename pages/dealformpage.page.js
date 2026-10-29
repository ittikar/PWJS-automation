import { expect } from '@playwright/test';
import path from 'path';

// Shared creation form for portfolios, opportunities, and club deals -- they all live at
// the same field ids regardless of asset group, with club deals adding a few extra fields.
export class DealFormPage {
  constructor(page) {
    this.page = page;

    this.dealNameInput = page.locator('input[name="dealName"]');
    this.targetInvestmentAmountInput = page.locator('input[name="targetInvestmentAmountUsd"]');
    this.minimumTicketSizeInput = page.locator('input[name="minimumTicketSizeUsd"]');
    this.settlementTypeRadios = page.locator('input[name="settlementType"]');

    this.saveAsDraftBtn = page.getByRole('button', { name: 'Save as Draft' });
    this.saveAndContinueBtn = page.getByRole('button', { name: 'Save & Continue' });
    this.skipParticipantsBtn = page.getByRole('button', { name: 'Skip & Continue' });
    this.submitBtn = page.getByRole('button', { name: 'Submit', exact: true });

    this.fileInput = page.locator('input[type="file"]').first();
    this.uploadProgressIndicator = page.getByText('100%');
  }

  // Navigates to `url` and runs `action`, retrying the whole thing (a fresh navigation,
  // not just a reload) if either hangs or throws. Reusing one page across many sequential
  // full-page navigations (as these asset-group loops do) occasionally leaves a page where
  // `load` never fires and/or a MUI Autocomplete field freezes on click -- a fresh
  // navigation reliably clears both. `waitUntil: 'domcontentloaded'` is used instead of the
  // default `load` (or `networkidle`) because the "Itti" chat panel's background activity
  // can keep the network busy indefinitely without the page actually being stuck.
  async withPageRetry(url, action, { retries = 3, navigationTimeout = 30000 } = {}) {
    let lastError;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: navigationTimeout });
        await action();
        return;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError;
  }

  // Picks a random option from a MUI Autocomplete combobox by its id. Returns null (and
  // leaves the field untouched) when the field is disabled or offers no options -- some
  // countries have no states, and some states have no cities.
  async selectRandomOption(id) {
    const combobox = this.page.locator(`#${id}`);
    const disabled = await combobox.isDisabled().catch(() => true);
    if (disabled) return null;

    // Bounded so a stuck click (a transient UI freeze) fails fast instead of silently
    // consuming the whole test timeout -- callers can catch this and retry.
    await combobox.click({ timeout: 15000 });

    const options = this.page.getByRole('option');
    try {
      await options.first().waitFor({ state: 'visible', timeout: 3000 });
    } catch {
      await this.page.keyboard.press('Escape');
      return null;
    }

    const count = await options.count();
    const chosen = options.nth(Math.floor(Math.random() * count));
    const label = (await chosen.innerText()).split('\n')[0].trim();
    // Bounded for the same reason as the combobox click above -- an unbounded click here
    // would hang until the whole test's timeout, bypassing the per-asset-group try/catch
    // that's supposed to let other asset groups still be attempted.
    await chosen.click({ timeout: 15000 });
    return label;
  }

  // Fills the deal-details step shared by portfolio and opportunity creation forms --
  // both use the same field ids (dealName, assetClass, sector, natureOfDeal, countryAlpha3,
  // state, city) regardless of asset group.
  async fillDealDetails(dealName) {
    await this.dealNameInput.fill(dealName);

    await this.selectRandomOption('assetClass');
    await this.selectRandomOption('sector');
    await this.selectRandomOption('natureOfDeal');

    await this.selectRandomOption('countryAlpha3');
    await this.page.waitForTimeout(500); // let State options load for the chosen country

    const state = await this.selectRandomOption('state');
    if (state) {
      await this.page.waitForTimeout(500); // let City options load for the chosen state
      await this.selectRandomOption('city');
    }
  }

  // Fills the club deal creation form, which has extra fields over portfolio/opportunity:
  // investment amounts and a Settlement Type radio group (Standard / Tokenized).
  async fillClubDealDetails(dealName) {
    await this.dealNameInput.fill(dealName);

    await this.selectRandomOption('assetClass');
    await this.selectRandomOption('sector');

    const targetAmount = (Math.floor(Math.random() * 95) + 5) * 1_000_000; // $5M - $100M
    const minTicket = (Math.floor(Math.random() * 19) + 1) * 50_000; // $50K - $1M
    await this.targetInvestmentAmountInput.fill(String(targetAmount));
    await this.minimumTicketSizeInput.fill(String(minTicket));

    await this.selectRandomOption('countryAlpha3');
    await this.page.waitForTimeout(500); // let State options load for the chosen country

    const state = await this.selectRandomOption('state');
    if (state) {
      await this.page.waitForTimeout(500); // let City options load for the chosen state
      await this.selectRandomOption('city');
    }

    await this.selectRandomOption('natureOfDeal');

    const radioCount = await this.settlementTypeRadios.count();
    await this.settlementTypeRadios.nth(Math.floor(Math.random() * radioCount)).check({ timeout: 15000 });
  }

  async saveAsDraft() {
    await this.saveAsDraftBtn.click({ timeout: 15000 });
  }

  async saveAndContinue() {
    await this.saveAndContinueBtn.click({ timeout: 15000 });
  }

  // Club deal creation has an extra "People and Organisations" step between Deal Details
  // and Data Room Documents that portfolio/opportunity don't have; this skips it.
  async skipParticipants() {
    await this.skipParticipantsBtn.click({ timeout: 15000 });
  }

  // The Data Room widget can get stuck on "LOADING DATA ROOM…" after the create-flow
  // transition; a reload reliably gets it to render its upload categories. Bounded and
  // using 'domcontentloaded' rather than 'networkidle' since the Itti chat panel's
  // background activity can keep the network busy indefinitely.
  async reloadDataRoom() {
    await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 30000 });
  }

  async uploadFiles(files) {
    await this.fileInput.setInputFiles(files, { timeout: 15000 });
  }

  // The upload progress indicator is transient, so wait for the filenames themselves
  // (which persist both during and after upload) and then for the percentage indicators
  // to clear, which is how this widget signals that uploads have actually finished.
  async waitForUploadsComplete(files, timeout = 30000) {
    for (const file of files) {
      await expect(this.page.getByText(path.basename(file))).toBeVisible({ timeout });
    }
    await expect(this.uploadProgressIndicator).toHaveCount(0, { timeout });
  }

  async submit() {
    await this.submitBtn.click({ timeout: 15000 });
  }

  // Dismisses a SweetAlert-style confirmation modal's "OK" button. A stray loading skeleton
  // from unrelated background content occasionally sits on top of it and never clears within
  // a normal timeout -- since callers only reach this after already seeing the confirmation
  // text (the underlying save/submit action is known to have succeeded), it's safe to fall
  // back to a forced click that bypasses the actionability/interception check.
  async dismissConfirmationModal({ name = 'OK' } = {}) {
    const okButton = this.page.getByRole('button', { name, exact: true });
    try {
      await okButton.click({ timeout: 20000 });
    } catch {
      await okButton.click({ timeout: 10000, force: true });
    }
  }
}
