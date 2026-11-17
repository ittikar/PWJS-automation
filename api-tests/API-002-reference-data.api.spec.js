import { test, expect } from '@playwright/test';
import { login } from './helpers/apiClient';
import { ASSET_GROUP_SLUGS, DEAL_USER, assetGroupCode } from './helpers/testData';

const EXPECTED_GROUPS = ASSET_GROUP_SLUGS.map(assetGroupCode);

test.describe('API-002 reference data', () => {
  let session;
  test.beforeAll(async ({ playwright }) => {
    session = await login(await playwright.request.newContext(), DEAL_USER);
  });

  for (const module of ['portfolio', 'opportunity', 'club-deal']) {
    test(`${module}: every asset group with its own asset classes, plus sectors and nature of deal`, async () => {
      const { body } = await session.get(`/ref-data/${module}`, { params: { locale: 'en' }, expectStatus: 200 });
      expect(body.module).toBe(module);
      const { assetGroup, sector, natureOfDeal } = body.lookups;

      expect(assetGroup.items.map(g => g.code).sort()).toEqual([...EXPECTED_GROUPS].sort());
      for (const group of assetGroup.items) {
        expect(group.displayName, `${group.code} display name`).toBeTruthy();
        expect(group.assetClass.length, `${group.code} asset classes`).toBeGreaterThan(0);
        for (const assetClass of group.assetClass) {
          expect(assetClass.code).toMatch(/^[A-Z0-9_]+$/);
          expect(assetClass.displayName).toBeTruthy();
        }
      }
      // An asset class belongs to one group only.
      const allClasses = assetGroup.items.flatMap(g => g.assetClass.map(c => c.code));
      expect(new Set(allClasses).size, 'asset class codes are unique across groups').toBe(allClasses.length);

      expect(sector.items.length).toBeGreaterThan(10);
      expect(natureOfDeal.items.map(n => n.code)).toEqual(expect.arrayContaining(['PRIMARY', 'SECONDARY', 'CO_INVESTMENT']));
    });
  }

  test('club-deal: settlement types and deal/participant statuses', async () => {
    const { body } = await session.get('/ref-data/club-deal', { params: { locale: 'en' }, expectStatus: 200 });
    const { settlementType, dealStatus, participantStatus } = body.lookups;
    expect(settlementType.items.map(s => s.code).sort()).toEqual(['STANDARD', 'TOKENIZED']);
    expect(dealStatus.items.map(s => s.code)).toEqual(expect.arrayContaining(['DRAFT', 'SUBMITTED', 'PUBLISHED']));
    expect(participantStatus.items.map(s => s.code)).toEqual(expect.arrayContaining(['KYB_SUBMITTED']));
  });

  test('portfolio and opportunity statuses', async () => {
    for (const [module, key] of [['portfolio', 'portfolioStatus'], ['opportunity', 'opportunityStatus']]) {
      const { body } = await session.get(`/ref-data/${module}`, { params: { locale: 'en' }, expectStatus: 200 });
      expect(body.lookups[key].items.map(s => s.code), `${module} statuses`).toEqual(
        expect.arrayContaining(['DRAFT', 'SUBMITTED', 'PUBLISHED'])
      );
    }
  });

  test('organisation: organisation types and onboarding statuses', async () => {
    const { body } = await session.get('/ref-data/organisation', { params: { locale: 'en' }, expectStatus: 200 });
    expect(body.lookups.orgType.items.map(t => t.code)).toEqual(expect.arrayContaining(['SINGLE_FAMILY_OFFICE', 'MULTI_FAMILY_OFFICE']));
    expect(body.lookups.onboardingStatus.items.map(s => s.code)).toEqual(expect.arrayContaining(['DRAFT', 'INITIATED', 'APPROVED']));
  });

  test('product hierarchy lists the five asset groups', async () => {
    const { body } = await session.get('/products/hierarchy', { params: { locale: 'en' }, expectStatus: 200 });
    const text = JSON.stringify(body);
    for (const slug of ASSET_GROUP_SLUGS) expect(text, `${slug} in the product hierarchy`).toContain(slug);
  });
});
