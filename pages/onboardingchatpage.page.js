// Itti's replies are non-deterministic: it may render the AUM form straight away, or reply
// with text only (e.g. "please complete the form below" with no form, or a confirmation
// question). Each of these affirmative replies nudges it towards rendering the form.
const POSITIVE_REPLIES = [
  'Yes, please proceed with self-service onboarding.',
  'Yes, please show me the AUM form.',
  'Yes, I confirm. Please display the AUM and currency form.',
  'Yes, I want to continue with self-service onboarding and enter my AUM details.',
];

export class OnboardingChatPage {
  constructor(page) {
    this.page = page;

    this.selfServiceOnboardingBtn = page.getByRole('button', { name: 'Self-Service Onboarding' });

    this.chatInput = page.getByRole('textbox', { name: 'Ask Itti' });
    this.sendMessageBtn = page.getByRole('button', { name: 'Send message' });

    this.currencyDropdown = page.getByRole('combobox', { name: /currency/i });
    this.aumLowerLimit = page.getByRole('textbox', { name: /AUM Lower Limit/i });
    this.aumUpperLimit = page.getByRole('textbox', { name: /AUM Upper Limit/i });
    this.saveAumBtn = page.getByRole('button', { name: 'Save' });
  }

  // currencyCode is the ISO code, e.g. 'USD'; options are named like "US USD US Dollar".
  async fillAumDetails({ lowerLimit, upperLimit, currencyCode }) {
    await this.aumLowerLimit.fill(lowerLimit);
    await this.aumUpperLimit.fill(upperLimit);
    await this.currencyDropdown.click();
    await this.page.getByRole('option', { name: new RegExp(`\\b${currencyCode}\\b`) }).click();
  }

  async saveAumDetails() {
    await this.saveAumBtn.click();
  }

  // Once saved, the form locks and Itti echoes the range back, e.g. "AUM Range: 1,000,000 – 10,000,000 USD".
  aumRangeConfirmation(currencyCode) {
    return this.page.getByText(new RegExp(`AUM Range:.*${currencyCode}`));
  }

  async startSelfServiceOnboarding() {
    await this.selfServiceOnboardingBtn.click();
  }

  async sendChatMessage(message) {
    // The input stays read-only while Itti is still streaming, and fill() waits for it.
    await this.chatInput.fill(message);
    await this.sendMessageBtn.click();
  }

  // Waits for the AUM form after each of Itti's replies and, when a reply arrives without
  // it, answers positively and tries again. Returns true once the form is visible.
  async waitForAumFormRespondingPositively({ waitPerReplyMs = 45000, replies = POSITIVE_REPLIES } = {}) {
    if (await this.isAumFormVisible(waitPerReplyMs)) return true;

    for (const reply of replies) {
      await this.sendChatMessage(reply);
      if (await this.isAumFormVisible(waitPerReplyMs)) return true;
    }

    return false;
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
