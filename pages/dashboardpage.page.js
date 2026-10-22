export class DashboardPage {
  constructor(page) {
    this.page = page;

    this.notNowBtn = page.getByRole('button', { name: 'Not now' });
    this.selfServiceOnboardingBtn = page.getByRole('button', { name: 'Self-Service Onboarding' });
    this.assistedOnboardingBtn = page.getByRole('button', { name: 'Assisted Onboarding' });
    this.dealsUnlockBanner = page.getByText("Deals unlock once you're onboarded");
    this.organisationsLink = page.getByRole('link', { name: 'Organisations' });
    this.usersLink = page.getByRole('link', { name: 'Users' });
  }

  async waitForLoad(timeout = 45000) {
    await this.page.waitForURL(url => url.pathname.startsWith('/itti'), { timeout });
  }

  // Dismisses the first-login "Quick tour" prompt if it appears.
  async dismissQuickTour() {
    await this.notNowBtn.click({ timeout: 5000 }).catch(() => {});
  }

  async goToOrganisations() {
    await this.organisationsLink.click();
  }

  async goToUsers() {
    await this.usersLink.click();
    await this.page.waitForURL(url => url.pathname === '/users', { timeout: 15000 });
  }

  async clickSelfServiceOnboarding() {
    await this.selfServiceOnboardingBtn.click();
  }

  // Confirms it's the right dashboard for the right user via a signal that renders every
  // login (unlike the "Good to see you" greeting, which only renders on the first ever login).
  getUserEmailText(email) {
    return this.page.getByText(email, { exact: false }).first();
  }
}
