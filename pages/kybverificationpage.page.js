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

  // Intro screen ("Verification for Ittikar"), then country of residence. The residence screen is
  // only part of some flows (the organisation's own onboarding has it, a deal participant's
  // verification doesn't), so it is answered only when it shows.
  async acceptIntro(residence) {
    await expect(this.heading('Verification for Ittikar')).toBeVisible({ timeout: 60000 });
    await this.continueBtn.click();

    const residenceRadio = this.widget.getByRole('radio', { name: residence, exact: true });
    await residenceRadio.or(this.heading("Let's find your company")).or(this.heading('Company information'))
      .first().waitFor({ timeout: 30000 });
    if (await residenceRadio.isVisible()) {
      await residenceRadio.check();
      await this.continueBtn.click();
    }
  }

  // Company name, registration number and country come prefilled from signup. A test company
  // isn't in any registry, so the search finds nothing and the details are confirmed by hand.
  async confirmCompanyData({ companyName, entityType }) {
    const findHeading = this.heading("Let's find your company");
    await findHeading.or(this.heading('Company information')).first().waitFor({ timeout: 30000 });
    if (await findHeading.isVisible()) await this.findCompanyBtn.click();
    // What the search leads to depends on the (random) country from signup:
    //  - straight to the "Company information" form (no registry for that country);
    //  - a results page with "Enter company data manually";
    //  - "No results found" in place with "Search again", which then leads to that results page.
    // Keep stepping until the form is shown.
    const searchAgainBtn = this.widget.getByRole('button', { name: 'Search again' });
    const companyInfoHeading = this.heading('Company information');
    await expect(async () => {
      if (await companyInfoHeading.isVisible().catch(() => false)) return;
      if (await this.enterManuallyBtn.isVisible().catch(() => false)) {
        await this.enterManuallyBtn.click({ timeout: 5000 });
      } else if (await searchAgainBtn.isVisible().catch(() => false)) {
        await searchAgainBtn.click({ timeout: 5000 });
      }
      await expect(companyInfoHeading).toBeVisible({ timeout: 10000 });
    }).toPass({ timeout: 90000, intervals: [2000, 5000] });
    await expect(this.companyNameInput).toHaveValue(companyName);
    // Not every form asks for it (a deal participant's doesn't).
    if ((await this.entityTypeSelect.count()) > 0) await this.entityTypeSelect.selectOption({ label: entityType });
    await this.saveAndContinueBtn.click();
  }

  // Uploads one file per document type, choosing the type under "Document type". A type drops out
  // of the choices once a file has been uploaded for it, so a type that is already listed as
  // uploaded, or no longer offered, is skipped.
  async uploadCompanyDocuments(documents) {
    await expect(this.heading('Company documents')).toBeVisible({ timeout: 30000 });
    // Depending on the widget version, "Document type" is either a native select or a button
    // that opens a "Select document type" dialog.
    const typeSelect = this.widget.locator('select[aria-label="Document type"]');
    const typeButton = this.widget.getByRole('button', { name: 'Document type' });
    const typeList = this.widget.getByRole('listbox', { name: 'Select document type' });
    const uploadedItem = type =>
      this.widget.getByRole('listitem').filter({ hasText: new RegExp(`^\\s*${type}\\s*(Delete)?\\s*$`) });
    await expect(typeSelect.or(typeButton).first()).toBeAttached({ timeout: 30000 });

    for (const { type, file } of documents) {
      if ((await uploadedItem(type).count()) > 0) continue;

      if ((await typeSelect.count()) > 0) {
        const option = typeSelect.locator('option').filter({ hasText: new RegExp(`^\\s*${type}\\s*$`) });
        if ((await option.count()) === 0) continue;
        await typeSelect.selectOption({ label: type }, { force: true });
        await this.fileInput.setInputFiles(path.join(process.cwd(), file));
        await expect(option).toHaveCount(0, { timeout: 60000 });
        continue;
      }

      // A click while the widget is still re-rendering after the previous upload can be lost, so
      // click again until the picker shows its options.
      await expect(async () => {
        if (!(await typeList.getByRole('option').first().isVisible().catch(() => false))) {
          await typeButton.click({ timeout: 5000 });
        }
        await expect(typeList.getByRole('option').first()).toBeVisible({ timeout: 5000 });
      }).toPass({ timeout: 45000, intervals: [1000, 2000, 3000] });
      const option = typeList.getByRole('option', { name: type, exact: true });
      if ((await option.count()) === 0) {
        await this.widget.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
        continue;
      }
      await option.click();
      await this.fileInput.setInputFiles(path.join(process.cwd(), file));
      // The uploaded file is listed with a loading bar until Sumsub has stored it.
      await expect(uploadedItem(type)).toBeVisible({ timeout: 30000 });
      await expect(uploadedItem(type).getByRole('progressbar')).toHaveCount(0, { timeout: 60000 });
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

    // Some flows (e.g. a deal participant's) also ask for gender, tax residence and an address.
    // Choosing tax residence re-renders the form (the address fields appear only then), so keep
    // setting whichever of these are shown and empty, and retry Create beneficiary, until it is accepted.
    const taxResidence = this.widget.getByRole('button', { name: /Tax residence country$/ });
    const gender = this.widget.getByRole('combobox', { name: 'Gender' });
    const extraFields = [
      {
        value: person.taxResidenceCountry,
        field: taxResidence,
        isSet: async () => (await taxResidence.innerText()).trim() === person.taxResidenceCountry,
        set: async () => {
          await taxResidence.click();
          await this.widget.getByRole('option', { name: person.taxResidenceCountry, exact: true }).click();
        },
      },
      {
        value: person.gender,
        field: gender,
        isSet: async () => (await gender.locator('option:checked').innerText()).trim() === person.gender,
        set: () => gender.selectOption({ label: person.gender }),
      },
      ...[['Post code', person.postCode], ['City', person.city], ['State', person.state]].map(([label, value]) => {
        const field = this.widget.getByRole('textbox', { name: label, exact: true });
        return {
          value,
          field,
          isSet: async () => (await field.inputValue()) === value,
          // Typed like a user and then left, so the widget records the change before the next field.
          set: async () => {
            await field.clear();
            await field.pressSequentially(value, { delay: 30 });
            await field.blur();
          },
        };
      }),
    ];

    const createBtn = this.widget.getByRole('button', { name: 'Create beneficiary' });
    const addedHeading = this.widget.getByRole('heading', { name: `${person.firstName} ${person.lastName}`, level: 3 });
    await expect(async () => {
      if (await createBtn.isVisible().catch(() => false)) {
        // Looked up on every pass: the address fields only appear once tax residence is chosen.
        for (const f of extraFields) {
          if (!f.value || (await f.field.count()) === 0 || (await f.isSet())) continue;
          await f.set();
          await this.page.waitForTimeout(700); // let the form re-render before the next field
        }
        await this.page.waitForTimeout(1000);
        await createBtn.click({ timeout: 5000 });
      }
      await expect(addedHeading).toBeVisible({ timeout: 10000 });
    }).toPass({ timeout: 120000, intervals: [1000, 2000] });
  }

  // Submits the company verification. Sumsub then asks every associated party to verify their
  // own identity (ID document and live selfie), which can't be done by a test.
  async submit({ trusteeCannotBeIdentified }) {
    // Only some flows have a Trustee role to mark as "Cannot be identified" (a deal participant's
    // asks just for UBO and Shareholder).
    const cannotBeIdentified = this.widget.getByRole('checkbox', { name: 'Cannot be identified' });
    await expect(this.submitBtn).toBeVisible({ timeout: 30000 });
    if (trusteeCannotBeIdentified && (await cannotBeIdentified.count()) > 0) {
      await cannotBeIdentified.check();
    }
    // A click straight after adding the beneficiary can be ignored while the widget is still saving,
    // so click again until it moves on.
    await expect(async () => {
      if (await this.submitBtn.isVisible().catch(() => false)) await this.submitBtn.click({ timeout: 5000 });
      await expect(this.oneLastStepHeading).toBeVisible({ timeout: 10000 });
    }).toPass({ timeout: 90000, intervals: [2000, 5000] });
  }
}
