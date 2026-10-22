import { expect } from '@playwright/test';

export class UsersPage {
  constructor(page) {
    this.page = page;

    this.addUserBtn = page.getByRole('button', { name: 'Add User', exact: true });
    this.firstNameInput = page.locator('input[name="first_name"]');
    this.lastNameInput = page.locator('input[name="last_name"]');
    this.emailInput = page.locator('input[name="email"]');
    this.roleCombobox = page.getByRole('combobox');
    this.successMessage = page.getByText(
      'The member has been successfully added. Temporary credentials have been emailed to them.'
    );
  }

  async inviteUser({ firstName, lastName, email, role }) {
    await this.addUserBtn.click();

    await this.firstNameInput.fill(firstName);
    await this.lastNameInput.fill(lastName);
    await this.emailInput.fill(email);

    await this.roleCombobox.click();
    await this.page.getByRole('option', { name: role, exact: true }).click();

    // The dialog's own submit button shares the same "Add User" name as the page-level
    // button that opened it; with the dialog open there are two matches, so take the last.
    await this.addUserBtn.last().click();

    await expect(this.successMessage).toBeVisible({ timeout: 15000 });
  }
}
