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

    // A new user, or one belonging to a single organisation, lands straight on the
    // dashboard. An account with more than one organisation instead lands on an
    // organisation-selector page and must pick one to proceed.
    await this.page.waitForURL(url => url.pathname.startsWith('/itti') || url.pathname.startsWith('/org'), {
      timeout: 45000,
    });

    if (new URL(this.page.url()).pathname.startsWith('/org')) {
      await this.selectOnboardedOrganisation();
    }
  }

  // On the multi-organisation selector, each organisation is its own clickable card
  // accessible as "Go to <org name>", labelled "Onboarded" or "Not onboarded" (shown
  // visually in caps via CSS text-transform, but the underlying text is title case).
  // Click the first onboarded one to proceed to the dashboard in that organisation's context.
  async selectOnboardedOrganisation() {
    const cards = this.page.getByRole('button', { name: /^Go to /i });
    await cards.first().waitFor({ state: 'visible', timeout: 15000 });

    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const text = await card.innerText().catch(() => '');
      if (/\bonboarded\b/i.test(text) && !/not onboarded/i.test(text)) {
        await card.click();
        await this.page.waitForURL(url => url.pathname.startsWith('/itti'), { timeout: 30000 });
        return;
      }
    }

    throw new Error('No onboarded organisation found on the organisation selector page.');
  }
}
