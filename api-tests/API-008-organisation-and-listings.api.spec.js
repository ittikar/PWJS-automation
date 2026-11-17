import { test, expect } from '@playwright/test';
import { login } from './helpers/apiClient';
import { searchMyDeals } from './helpers/deals';
import { DATA_ROOM_REQUESTER, DEAL_USER } from './helpers/testData';

// Read-only checks of the organisation and the dashboard's listings and deal pages.

test.describe('API-008 organisation and listings', () => {
  let owner;
  test.beforeAll(async ({ playwright }) => {
    owner = await login(await playwright.request.newContext(), DEAL_USER);
  });

  for (const [label, user] of [['deal user', DEAL_USER], ['data room requester', DATA_ROOM_REQUESTER]]) {
    test(`${label}'s organisation lists them as an active member`, async ({ request }) => {
      const session = await login(request, user);
      const { body } = await session.get(`/services/user-management/orgs/${session.organisation.org_ref_id}/members`, {
        params: { page: 1, per_page: 100 },
        expectStatus: 200,
      });
      const me = body.data.find(m => m.email === user.email);
      expect(me, `${user.email} among the members`).toBeTruthy();
      expect(me.status).toBe('active');
      expect(me.role).toBe(session.organisation.role);
    });
  }

  test('own deal listings: club deals, portfolios and opportunities', async () => {
    for (const [path, label] of [
      ['/services/deal-onboarding/deals/my-deals', 'club deals'],
      ['/services/deal-onboarding/portfolios/my-portfolios', 'portfolios'],
      ['/services/deal-onboarding/opportunities/my-opportunities', 'opportunities'],
    ]) {
      const { body } = await owner.get(path, { params: { page: 1, pageSize: 10 }, expectStatus: 200 });
      expect(body.items.length, `own ${label}`).toBeGreaterThan(0);
      for (const item of body.items) {
        expect(item.dealName).toBeTruthy();
        expect(item.status).toBeTruthy();
      }
    }
  });

  test("other organisations' deals and the asset class stats", async () => {
    const { body: others } = await owner.get('/services/deal-onboarding/deals/others', { params: { page: 1, pageSize: 20 }, expectStatus: 200 });
    expect(Array.isArray(others.items)).toBe(true);
    const { body: stats } = await owner.get('/services/deal-onboarding/deals/stats/asset-classes', { expectStatus: 200 });
    expect(stats).toBeTruthy();
  });

  test('a published club deal: details and status timeline', async () => {
    const [deal] = await searchMyDeals(owner, 'clubDeal', 'private-equity', { status: 'PUBLISHED' });
    expect(deal, 'a Published private-equity club deal').toBeTruthy();
    const query = { proxy_product_id: 'private-equity', proxy_usecase_id: 'deals' };

    const { body: details } = await owner.get(`/services/deal-onboarding/deals/${deal.id}`, { params: query, expectStatus: 200 });
    expect(details.dealName).toBe(deal.dealName);
    expect(details.status).toBe('PUBLISHED');
    expect(details.assetGroupCode).toBe('PRIVATE_EQUITY');
    expect(details.referenceCode).toMatch(/^CD-/);
    expect(details.targetInvestmentAmountUsd).toBeGreaterThan(0);

    const { body: timeline } = await owner.get(`/services/deal-onboarding/deals-compliance/${deal.complianceId}/status-timeline`, {
      params: { proxy_product_id: 'private-equity', proxy_usecase_id: 'deals-compliance' },
      expectStatus: 200,
    });
    const track = timeline.tracks.find(t => t.source === 'PUBLISHED');
    expect(track.currentStatus).toBe('PUBLISHED');
    expect(track.track[0].code).toBe('DRAFT');
  });

  test('the requester can see the published deal but not edit it', async ({ request }) => {
    const requester = await login(request, DATA_ROOM_REQUESTER);
    const [deal] = await searchMyDeals(owner, 'clubDeal', 'private-equity', { status: 'PUBLISHED' });
    const query = { proxy_product_id: 'private-equity', proxy_usecase_id: 'deals' };
    const { body } = await requester.get(`/services/deal-onboarding/deals/${deal.id}`, { params: query, expectStatus: 200 });
    expect(body.ownerOrgName).toBe(deal.ownerOrgName);

    // Submitting someone else's deal is refused.
    const { status } = await requester.patch(`/services/deal-onboarding/deals-compliance/${deal.complianceId}/submit`, { version: 1 }, {
      params: { proxy_product_id: 'private-equity', proxy_usecase_id: 'deals-compliance' },
    });
    expect(status, "submitting another organisation's deal").toBeGreaterThanOrEqual(400);
  });
});
