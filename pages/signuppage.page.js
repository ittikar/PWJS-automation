export class SignupPage {
  constructor(page) {
    this.page = page;

    // Entry point
    this.createAccountBtn = page.getByRole('button', { name: 'Create Account' });

    // Form fields
    this.workEmail = page.getByRole('textbox', { name: 'Work email' });
    this.firstName = page.getByRole('textbox', { name: 'First name' });
    this.lastName = page.getByRole('textbox', { name: 'Last name' });
    this.password = page.getByRole('textbox', { name: 'Password', exact: true });
    this.confirmPassword = page.getByRole('textbox', { name: 'Confirm password' });
    this.orgLegalName = page.getByRole('textbox', { name: 'Organisation legal name' });
    this.orgRegNo = page.getByRole('textbox', { name: 'Organisation number or code' });

    // Dropdown
    this.countryDropdown = page.getByRole('combobox', { name: 'Country' });

    // Actions
    this.proceedBtn = page.getByRole('button', { name: 'Proceed' });

    // Email verification (one textbox per OTP digit)
    this.otpInputs = page.getByRole('textbox');
    this.verifyEmailBtn = page.getByRole('button', { name: 'Verify Email' });
    this.okBtn = page.getByRole('button', { name: 'OK' });
  }

  async goto(url) {
    await this.page.goto(url);
  }

  async clickCreateAccount() {
    await this.createAccountBtn.click();
  }

  // Fill full form
  async fillForm(data) {
    await this.workEmail.click();
    await this.workEmail.fill(data.email);

    await this.firstName.click();
    await this.firstName.fill(data.firstName);
    await this.firstName.press('Tab');

    await this.lastName.fill(data.lastName);
    await this.lastName.press('Tab');

    await this.password.fill(data.password);
    await this.password.press('Tab');

    await this.confirmPassword.fill(data.password);

    await this.orgLegalName.click();
    await this.orgLegalName.fill(data.orgName);
    await this.orgLegalName.press('Tab');

    await this.orgRegNo.click();
    await this.orgRegNo.fill(data.orgRegNo);
  }

  // Select country (dynamic)
  async selectCountry(countryName) {
    await this.countryDropdown.click();
    await this.page.getByRole('option', { name: countryName, exact: true }).click();
  }

  // Submit form
  async proceed() {
    await this.proceedBtn.click();
  }

  // Complete email verification step by filling the 6 OTP digit boxes
  async verifyEmail(otp) {
    const digits = String(otp).split('');
    const inputs = await this.otpInputs.all();

    for (let i = 0; i < digits.length && i < inputs.length; i++) {
      await inputs[i].fill(digits[i]);
    }

    // Filling the last digit can auto-submit and advance straight to the success dialog
    // before this click happens, so don't hang waiting for a button that's already gone.
    await this.verifyEmailBtn.click({ timeout: 5000 }).catch(() => {});

    await this.okBtn.click();
  }
}
