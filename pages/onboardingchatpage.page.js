export class OnboardingChatPage {
  constructor(page) {
    this.page = page;

    this.selfServiceOnboardingBtn = page.getByRole('button', { name: 'Self-Service Onboarding' });
    // Same chip as above, but accessed via its alternate accessible name (aria-label).
    // Itti's first reply is sometimes just a conversational confirmation step rather than
    // the form itself; clicking the same entry point again can push it to render the form.
    this.onboardIndependentlyBtn = page.getByRole('button', { name: 'Onboard independently, at' });

    this.currencyDropdown = page.getByRole('combobox', { name: /currency/i });
    this.aumLowerLimit = page.getByRole('textbox', { name: /AUM Lower Limit/i });
    this.aumUpperLimit = page.getByRole('textbox', { name: /AUM Upper Limit/i });
  }

  async startSelfServiceOnboarding() {
    await this.selfServiceOnboardingBtn.click();
  }

  async retryProceed() {
    await this.onboardIndependentlyBtn.click();
  }

  // Polls (rather than a single check) since Itti's reply streams in gradually; returns
  // true only once all three AUM-form controls are simultaneously visible.
  async isAumFormVisible(timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const visible =
        (await this.currencyDropdown.isVisible().catch(() => false)) &&
        (await this.aumLowerLimit.isVisible().catch(() => false)) &&
        (await this.aumUpperLimit.isVisible().catch(() => false));
      if (visible) return true;
      await this.page.waitForTimeout(1000);
    }
    return false;
  }
}
