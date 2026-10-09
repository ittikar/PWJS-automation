export async function getOtpFromYopmail(context, email, options = {}) {
  const { retries = 10, retryDelayMs = 3000 } = options;
  const mailPage = await context.newPage();

  try {
    await mailPage.goto('https://yopmail.com/en/');
    await mailPage.getByRole('textbox', { name: 'Login' }).click();
    await mailPage.getByRole('textbox', { name: 'Login' }).fill(email);
    await mailPage.getByRole('textbox', { name: 'Login' }).press('Enter');

    const mailFrame = mailPage.frameLocator('iframe[name="ifmail"]');

    for (let attempt = 0; attempt < retries; attempt++) {
      await mailPage.waitForTimeout(retryDelayMs);

      const bodyText = await mailFrame.locator('body').innerText().catch(() => '');
      const match = bodyText.match(/\b(\d{6})\b/);
      if (match) {
        return match[1];
      }

      await mailPage.reload();
    }

    throw new Error(`OTP email not received for ${email}`);
  } finally {
    await mailPage.close();
  }
}
