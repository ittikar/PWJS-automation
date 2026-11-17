// Listing type (last part of /deals/<asset-group>/<type>) -> that listing's search page.
const SEARCH_PATHS = {
  portfolios: '/deals/portfolio-search',
  opportunities: '/deals/opportunity-search',
  'club-deal': '/deals/search',
};

// Searches an asset group's deal listing (portfolios, opportunities, or club deals) by name
// through the listing's own Search panel -- the same place a user would look -- so a deal
// only counts as created if it actually shows up there, under the asset group it was meant for.
export class DealSearchPage {
  constructor(page) {
    this.page = page;

    this.nameInput = page.getByRole('textbox', { name: 'Name' });
    this.includeDraftsCheckbox = page.getByRole('checkbox', { name: /Include drafts/i });
    this.statusFilter = page.getByRole('combobox', { name: 'Status' });
    this.applyBtn = page.getByRole('button', { name: /^Apply/ });
    this.noMatchesText = page.getByText('No matches');
    this.searchResultsHeading = page.getByRole('heading', { name: 'Search results' });
    this.resultTiles = page.locator('main [data-tile-id]');
  }

  // Each result tile exposes its name through a "Deal name <NAME>. Click to copy." button,
  // with the name upper-cased by the app.
  dealNameButton(name) {
    return this.page.getByRole('button', { name: `Deal name ${name.toUpperCase()}. Click to copy.`, exact: true });
  }

  // The status chip ("Draft", "Published", "DD In Progress", ...) sits beside the reference
  // code at the top of the deal's tile.
  statusChip(name) {
    return this.page.locator('[data-tile-id]').filter({ has: this.dealNameButton(name) }).locator('.deal-media .MuiChip-root').first();
  }

  // Opens the Search panel for a listing (/deals/<asset-group>/<portfolios|opportunities|club-deal>),
  // scoped to that listing's asset group. Goes straight to the panel's URL rather than clicking
  // the listing's Search button: clicked before the listing has finished loading, that button
  // opens the panel with no assetGroupCode, which silently searches every asset group.
  async openSearchPanel(listingUrl) {
    const { origin, pathname } = new URL(listingUrl);
    const [, , slug, listingType] = pathname.split('/');
    const searchPath = SEARCH_PATHS[listingType];
    if (!searchPath) throw new Error(`No search page known for listing ${listingUrl}`);

    const assetGroupCode = slug.toUpperCase().replace(/-/g, '_');
    await this.page.goto(`${origin}${searchPath}?panel=filters&assetGroupCode=${assetGroupCode}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await this.nameInput.waitFor({ state: 'visible', timeout: 20000 });
  }

  // Returns { found, status }. Retried a few times, since a deal saved moments ago can take
  // a little while to become searchable.
  async findDeal(listingUrl, name, { attempts = 3, retryDelayMs = 5000 } = {}) {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      await this.openSearchPanel(listingUrl);
      await this.nameInput.fill(name);
      await this.includeDraftsCheckbox.check({ timeout: 10000 });
      await this.applyBtn.click({ timeout: 10000 });

      const nameBtn = this.dealNameButton(name);
      await nameBtn.or(this.noMatchesText).first().waitFor({ state: 'visible', timeout: 30000 });

      if (await nameBtn.isVisible()) {
        const status = await this.statusChip(name).getAttribute('aria-label', { timeout: 10000 }).catch(() => null);
        return { found: true, status };
      }

      if (attempt < attempts) await this.page.waitForTimeout(retryDelayMs);
    }
    return { found: false, status: null };
  }

  // Searches the listing by status alone (e.g. 'Published'). Returns true when anything matched.
  async searchByStatus(listingUrl, status) {
    await this.openSearchPanel(listingUrl);
    await this.statusFilter.click({ timeout: 10000 });
    await this.page.getByRole('option', { name: status, exact: true }).click({ timeout: 10000 });
    await this.page.keyboard.press('Escape');
    await this.applyBtn.click({ timeout: 10000 });
    await this.searchResultsHeading.waitFor({ state: 'visible', timeout: 30000 });

    const firstTile = this.resultTiles.first();
    await firstTile.or(this.noMatchesText).first().waitFor({ state: 'visible', timeout: 30000 });
    return firstTile.isVisible();
  }

  async tileDealName(tile) {
    const label = await tile.getByRole('button', { name: /^Deal name / }).getAttribute('aria-label');
    return label.replace(/^Deal name /, '').replace(/\. Click to copy\.$/, '');
  }

  // Returns the first deal in this asset group with the given status, or null when it has none.
  async findFirstDealWithStatus(listingUrl, status) {
    if (!(await this.searchByStatus(listingUrl, status))) return null;
    return this.tileDealName(this.resultTiles.first());
  }

  // Returns the names of every deal in this asset group with the given status that the logged-in
  // organisation owns. For published deals the search also returns other organisations' deals,
  // which can't be told apart by name -- but only the owner's tiles offer an Edit button.
  async findOwnDealsWithStatus(listingUrl, status) {
    if (!(await this.searchByStatus(listingUrl, status))) return [];
    await this.loadAllResults();

    const names = [];
    for (const tile of await this.resultTiles.all()) {
      if (await tile.getByRole('button', { name: /^Edit / }).count()) names.push(await this.tileDealName(tile));
    }
    return names;
  }

  // Results load 10 at a time as the list is scrolled, until "You've seen all N deals".
  async loadAllResults({ maxScrolls = 20 } = {}) {
    const seenAll = this.page.getByText(/You've seen all/i);
    let unchanged = 0;
    for (let i = 0; i < maxScrolls && unchanged < 2; i++) {
      if (await seenAll.isVisible().catch(() => false)) return;
      const before = await this.resultTiles.count();
      await this.resultTiles.last().scrollIntoViewIfNeeded();
      await this.page.waitForTimeout(1500);
      unchanged = (await this.resultTiles.count()) === before ? unchanged + 1 : 0;
    }
  }

  // Opens a deal found by findDeal/findFirstDealWithStatus (still on the results page).
  async openDeal(name) {
    const tile = this.resultTiles.filter({ has: this.dealNameButton(name) });
    await tile.getByRole('button', { name: 'View', exact: true }).first().click({ timeout: 15000 });
    await this.page.waitForURL(/\/view$/, { timeout: 30000 });
  }

  // Confirms one asset group's draft + submitted pair: the draft must be listed as Draft, and
  // the submitted deal must be listed with any status past Draft (it moves on through due
  // diligence to Published on its own, so the exact status depends on timing).
  // A single submitted deal: listed under the asset group with a non-draft status.
  async verifySubmittedDeal(listingUrl, name) {
    const deal = await this.findDeal(listingUrl, name);
    let error;
    if (!deal.found) error = `submitted "${name}" not found in ${listingUrl}`;
    else if (!deal.status || deal.status === 'Draft') {
      error = `submitted "${name}" has status "${deal.status}", expected a non-draft status`;
    }
    return { ok: !error, status: deal.found ? deal.status : 'NOT FOUND', error };
  }

  async verifyDealPair(listingUrl, { draftName, submittedName }) {
    const draft = await this.findDeal(listingUrl, draftName);
    const submitted = await this.findDeal(listingUrl, submittedName);

    const problems = [];
    if (!draft.found) problems.push(`draft "${draftName}" not found in ${listingUrl}`);
    else if (draft.status !== 'Draft') problems.push(`draft "${draftName}" has status "${draft.status}", expected "Draft"`);

    if (!submitted.found) problems.push(`submitted "${submittedName}" not found in ${listingUrl}`);
    else if (!submitted.status || submitted.status === 'Draft') {
      problems.push(`submitted "${submittedName}" has status "${submitted.status}", expected a non-draft status`);
    }

    return {
      ok: problems.length === 0,
      draftStatus: draft.found ? draft.status : 'NOT FOUND',
      submittedStatus: submitted.found ? submitted.status : 'NOT FOUND',
      error: problems.join('; ') || undefined,
    };
  }
}
