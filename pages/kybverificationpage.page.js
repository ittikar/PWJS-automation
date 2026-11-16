import { expect } from '@playwright/test';
import path from 'path';

// The company verification (KYB) screen opened by "Start Verification" (/customer-onboarding).
// The form itself is Sumsub's widget, embedded in an iframe.
export class KybVerificationPage {
  constructor(page) {
    this.page = page;
    this.widget = page.frameLocator('iframe[src*="sumsub.com"]').first();

    this.continueBtn = this.widget.getByRole('button', { name: 'Continue', exact: true });
    this.findCompanyBtn = this.widget.getByRole('button', { name: 'Find company' });
    this.enterManuallyBtn = this.widget.getByRole('button', { name: 'Enter company data manually' });
    this.companyNameInput = this.widget.getByRole('textbox', { name: 'Company name' });
    this.entityTypeSelect = this.widget.getByRole('combobox', { name: 'Type of entity' });
    this.saveAndContinueBtn = this.widget.getByRole('button', { name: 'Save and continue' });
    this.fileInput = this.widget.locator('input[type="file"]').first();
    this.addIndividualBtn = this.widget.getByRole('button', { name: 'Add individual' });
    this.submitBtn = this.widget.getByRole('button', { name: 'Submit', exact: true });
    this.oneLastStepHeading = this.widget.getByRole('heading', { name: 'One last step' });
  }

  heading(name) {
    return this.widget.getByRole('heading', { name, level: 1 });
  }

  // Step 1 of the onboarding wizard ("AUM Details") sometimes appears first, asking to review the
  // AUM entered in the chat; other times the wizard opens straight on the widget. When it shows,
  // check the values and continue.
  async confirmAumStepIfShown({ lowerLimit, upperLimit, currency }) {
    const aumHeading = this.page.getByText('AUM Details', { exact: true });
    const shown = await aumHeading
      .or(this.page.locator('iframe[src*="sumsub.com"]'))
      .first()
      .waitFor({ state: 'visible', timeout: 30000 })
      .then(() => aumHeading.isVisible());
    if (!shown) return;

    // The chat's AUM form stays on the page (disabled) under the same labels, so only look at the
    // enabled fields, which belong to this step.
    await expect(this.page.getByRole('textbox', { name: 'AUM Lower Limit', disabled: false })).toHaveValue(lowerLimit);
    await expect(this.page.getByRole('textbox', { name: 'AUM Upper Limit', disabled: false })).toHaveValue(upperLimit);
    // The currency picker is an input (e.g. value "USD - US Dollar"), so check its value, not its text.
    await expect(this.page.getByRole('combobox', { name: 'Currency', disabled: false })).toHaveValue(
      new RegExp(`^${currency}\\b`)
    );
    await this.page.getByRole('button', { name: 'Save & Continue' }).click();
  }

  // Intro screen ("Verification for Ittikar"), then country of residence.
  async acceptIntro(residence) {
    await expect(this.heading('Verification for Ittikar')).toBeVisible({ timeout: 60000 });
    await this.continueBtn.click();
    await this.widget.getByRole('radio', { name: residence, exact: true }).check();
    await this.continueBtn.click();
  }

  // Company name, registration number and country come prefilled from signup. A test company
  // isn't in any registry, so the search finds nothing and the details are confirmed by hand.
  async confirmCompanyData({ companyName, entityType }) {
    await expect(this.heading("Let's find your company")).toBeVisible({ timeout: 30000 });
    await this.findCompanyBtn.click();
    await this.enterManuallyBtn.click({ timeout: 30000 });

    await expect(this.heading('Company information')).toBeVisible({ timeout: 30000 });
    await expect(this.companyNameInput).toHaveValue(companyName);
    await this.entityTypeSelect.selectOption({ label: entityType });
    await this.saveAndContinueBtn.click();
  }

  // Uploads one file per document type, choosing the type in the "Document type" dropdown (a
  // native select). A type drops out of that dropdown once a file has been uploaded for it, so a
  // type that is neither offered nor listed there is already uploaded and is skipped.
  async uploadCompanyDocuments(documents) {
    await expect(this.heading('Company documents')).toBeVisible({ timeout: 30000 });
    const typeSelect = this.widget.locator('select[aria-label="Document type"]');
    const typeOption = type => typeSelect.locator('option').filter({ hasText: new RegExp(`^\\s*${type}\\s*$`) });

    for (const { type, file } of documents) {
      await typeSelect.waitFor({ state: 'attached', timeout: 30000 });
      if ((await typeOption(type).count()) === 0) continue;

      await typeSelect.selectOption({ label: type }, { force: true });
      await this.fileInput.setInputFiles(path.join(process.cwd(), file));
      await expect(typeOption(type)).toHaveCount(0, { timeout: 60000 });
    }

    await this.continueBtn.click();
  }

  // Adds one individual with the given roles (e.g. UBO and Shareholder) and personal details.
  async addIndividual(person) {
    await expect(this.heading('Associated parties of your company')).toBeVisible({ timeout: 30000 });
    await this.addIndividualBtn.click();

    await this.widget.getByRole('button', { name: 'Assign roles' }).click();
    for (const role of person.roles) {
      await this.widget.getByRole('checkbox', { name: new RegExp(`^${role} `) }).check();
    }
    await this.widget.getByRole('button', { name: 'Save', exact: true }).click();

    await this.widget.getByRole('button', { name: 'Select reason' }).click();
    await this.widget.getByRole('radio', { name: new RegExp(`^${person.reason}`) }).check();
    await this.widget.getByRole('button', { name: 'Save', exact: true }).click();
    await this.widget.getByRole('spinbutton', { name: 'Percentage of ownership' }).fill(person.ownershipPercentage);

    await this.widget.getByRole('textbox', { name: 'First name' }).fill(person.firstName);
    await this.widget.getByRole('textbox', { name: 'Last name' }).fill(person.lastName);
    await this.widget.getByRole('textbox', { name: 'Date of birth' }).fill(person.dateOfBirth);
    await this.widget.getByRole('textbox', { name: 'Email' }).fill(person.email);
    await this.widget.getByRole('textbox', { name: 'Phone number' }).fill(person.phone);
    await this.widget.getByRole('button', { name: 'Nationality Nationality' }).click();
    await this.widget.getByRole('option', { name: person.nationality, exact: true }).click();

    await this.widget.getByRole('button', { name: 'Create beneficiary' }).click();
    await expect(
      this.widget.getByRole('heading', { name: `${person.firstName} ${person.lastName}`, level: 3 })
    ).toBeVisible({ timeout: 30000 });
  }

  // Submits the company verification. Sumsub then asks every associated party to verify their
  // own identity (ID document and live selfie), which can't be done by a test.
  async submit({ trusteeCannotBeIdentified }) {
    if (trusteeCannotBeIdentified) {
      await this.widget.getByRole('checkbox', { name: 'Cannot be identified' }).check();
    }
    // A click straight after adding the beneficiary can be ignored while the widget is still saving,
    // so click again until it moves on.
    await expect(async () => {
      if (await this.submitBtn.isVisible().catch(() => false)) await this.submitBtn.click({ timeout: 5000 });
      await expect(this.oneLastStepHeading).toBeVisible({ timeout: 10000 });
    }).toPass({ timeout: 90000, intervals: [2000, 5000] });
  }
}
