export class OrganisationsPage {
  constructor(page) {
    this.page = page;

    this.rootRoleBadge = page.getByText('ROOT · READ-WRITE');
    this.notOnboardedBadge = page.getByText('NOT ONBOARDED');
    this.addOrganisationBtn = page.getByRole('button', { name: 'Add Organisation' });
  }

  async goto(url) {
    await this.page.goto(url);
  }
}
