import { expect } from '@playwright/test';
import path from 'path';

// 'private-equity' -> 'PRIVATE_EQUITY', the code the backend uses for asset groups.
export function assetGroupCodeFor(slug) {
  return slug.toUpperCase().replace(/-/g, '_');
}

// Each creation form loads its lookups (asset groups and their asset classes) from
// /ref-data/<module>: portfolio, opportunity, or club-deal.
function refDataModuleFor(url) {
  const { pathname } = new URL(url);
  if (pathname.startsWith('/deals/portfolios/')) return 'portfolio';
  if (pathname.startsWith('/deals/opportunities/')) return 'opportunity';
  return 'club-deal';
}

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

    this.refData = {};
    this.lastSavedAssetGroupCode = null;
    page.on('response', response => this.captureResponse(response));
  }

  async captureResponse(response) {
    const url = response.url().split('?')[0];

    const refDataModule = url.match(/\/ref-data\/([a-z-]+)$/)?.[1];
    if (refDataModule) {
      const data = await response.json().catch(() => null);
      if (data) this.refData[refDataModule] = data;
      return;
    }

    // Creating a deal is a POST to /deal-onboarding/<type>-compliance; the response carries
    // the asset group the backend filed it under.
    if (response.request().method() === 'POST' && /\/deal-onboarding\/[a-z-]+-compliance$/.test(url)) {
      const body = await response.text().catch(() => '');
      this.lastSavedAssetGroupCode = body.match(/"assetGroupCode"\s*:\s*"([A-Z_]+)"/)?.[1] ?? null;
    }
  }

  // The backend derives a deal's asset group from its asset class (the URL's assetGroup
  // only drives the UI), so this confirms the deal just saved landed in the intended group.
  async expectSavedInAssetGroup(slug) {
    await expect
      .poll(() => this.lastSavedAssetGroupCode, { message: `Deal should be saved under ${slug}`, timeout: 10000 })
      .toBe(assetGroupCodeFor(slug));
  }

  // Right after load, the Asset Class dropdown briefly offers a placeholder list (a short
  // generic one, or every group's classes) before narrowing to this page's asset group.
  // A random pick from that early list files the deal under some other group, so wait until
  // the offered options are exactly this group's classes (per the form's own ref-data).
  async selectAssetClass(timeout = 20000) {
    const pageUrl = this.page.url();
    const groupCode = assetGroupCodeFor(new URL(pageUrl).searchParams.get('assetGroup'));
    const module = refDataModuleFor(pageUrl);
    const combobox = this.page.locator('#assetClass');
    const options = this.page.getByRole('option');

    await expect(async () => {
      const group = this.refData[module]?.lookups?.assetGroup?.items?.find(item => item.code === groupCode);
      if (!group) throw new Error(`Asset classes for ${groupCode} not loaded yet`);
      const expected = new Set(group.assetClass.filter(c => c.uiRender !== false).map(c => c.displayName));

      await combobox.click({ timeout: 5000 });
      await options.first().waitFor({ state: 'visible', timeout: 3000 });
      const offered = (await options.allInnerTexts()).map(text => text.split('\n')[0].trim());

      if (offered.length !== expected.size || !offered.every(label => expected.has(label))) {
        await this.page.keyboard.press('Escape');
        throw new Error(`Asset Class dropdown not yet narrowed to ${groupCode}`);
      }
    }).toPass({ timeout, intervals: [500, 1000] });

    const count = await options.count();
    await options.nth(Math.floor(Math.random() * count)).click({ timeout: 15000 });
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

    await this.selectAssetClass();
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

    await this.selectAssetClass();
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
    this.lastSavedAssetGroupCode = null;
    await this.saveAsDraftBtn.click({ timeout: 15000 });
  }

  async saveAndContinue() {
    this.lastSavedAssetGroupCode = null;
    await this.saveAndContinueBtn.click({ timeout: 15000 });
  }

  // Club deal creation has an extra "People and Organisations" step between Deal Details
  // and Data Room Documents that portfolio/opportunity don't have; this skips it.
  async skipParticipants() {
    await this.skipParticipantsBtn.click({ timeout: 15000 });
  }

  // Adds one participant organisation on the "People and Organisations" step. It is listed with
  // status "KYB Pending" until its company verification (Sumsub) is done. Returns the
  // participant as saved by the backend (id, status, complianceProviderId, ...).
  async addParticipant({ companyName, country, registrationNumber }) {
    await this.page.getByRole('button', { name: 'Add People and Organisations' }).click({ timeout: 15000 });
    const dialog = this.page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: 'Company Name*' }).fill(companyName);
    // The country list only renders the options in view, so type to filter it first.
    await dialog.getByRole('combobox', { name: 'Country*' }).fill(country);
    await this.page.getByRole('option', { name: country, exact: true }).click();
    await dialog.getByRole('textbox', { name: 'Registration No*' }).fill(registrationNumber);

    const saved = this.page.waitForResponse(
      r => r.request().method() === 'POST' && /\/participants(\?|$)/.test(r.url()),
      { timeout: 20000 }
    );
    await dialog.getByRole('button', { name: 'Save' }).click();
    const response = await saved;
    expect(response.ok(), `Saving participant ${companyName}`).toBe(true);

    await expect(this.page.getByRole('heading', { name: companyName })).toBeVisible({ timeout: 15000 });
    return response.json();
  }

  // Leaves the "People and Organisations" step once participants have been added.
  async continueFromParticipants() {
    await this.page.getByRole('button', { name: 'Continue', exact: true }).click({ timeout: 15000 });
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
