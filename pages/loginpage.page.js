export class LoginPage {
  constructor(page) {
    this.page = page;

    this.workEmail = page.getByRole('textbox', { name: 'Work email' });
    this.password = page.getByRole('textbox', { name: 'Password', exact: true });

    // "Sign in" also matches the sign-in-method toggle button, so scope to the submit control.
    this.signInBtn = page
      .getByRole('button', { name: 'Sign in', exact: true })
      .and(page.locator('[type="submit"]'));
  }

  async goto(url) {
    await this.page.goto(url);
  }

  async login(email, password) {
    await this.workEmail.fill(email);
    await this.password.fill(password);
    await this.signInBtn.click();
  }
}
