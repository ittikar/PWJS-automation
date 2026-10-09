import fs from 'fs';
import path from 'path';

// Picks a random option from a MUI Autocomplete combobox by its id. Returns null (and leaves
// the field untouched) when the field is disabled or offers no options -- some countries have
// no states, and some states have no cities.
export async function selectRandomOption(page, id) {
  const combobox = page.locator(`#${id}`);
  const disabled = await combobox.isDisabled().catch(() => true);
  if (disabled) return null;

  await combobox.click();

  const options = page.getByRole('option');
  try {
    await options.first().waitFor({ state: 'visible', timeout: 3000 });
  } catch {
    await page.keyboard.press('Escape');
    return null;
  }

  const count = await options.count();
  const chosen = options.nth(Math.floor(Math.random() * count));
  const label = (await chosen.innerText()).split('\n')[0].trim();
  await chosen.click();
  return label;
}

// Fills the deal-details step shared by portfolio and opportunity creation forms --
// both use the same field ids (dealName, assetClass, sector, natureOfDeal, countryAlpha3,
// state, city) regardless of asset group.
export async function fillDealDetails(page, dealName) {
  await page.locator('input[name="dealName"]').fill(dealName);

  await selectRandomOption(page, 'assetClass');
  await selectRandomOption(page, 'sector');
  await selectRandomOption(page, 'natureOfDeal');

  await selectRandomOption(page, 'countryAlpha3');
  await page.waitForTimeout(500); // let State options load for the chosen country

  const state = await selectRandomOption(page, 'state');
  if (state) {
    await page.waitForTimeout(500); // let City options load for the chosen state
    await selectRandomOption(page, 'city');
  }
}

export function pickRandomFiles(count, dir = path.join(process.cwd(), 'dataroom')) {
  const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.pdf'));
  const shuffled = files.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map(f => path.join(dir, f));
}
