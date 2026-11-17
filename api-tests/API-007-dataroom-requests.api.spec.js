import { test, expect } from '@playwright/test';
import { login } from './helpers/apiClient';
import { searchMyDeals } from './helpers/deals';
import { ASSET_GROUP_SLUGS, DATA_ROOM_REQUESTER, DEAL_USER } from './helpers/testData';

// Data room access between two organisations, in every asset group: the requester asks to see one
// of the deal user's Published club deals, the owner sees it pending and approves it, and both
// sides then see it approved. A request can't be withdrawn and a deal can only be requested once,
// so each run uses up one Published club deal per group (TC-REG-168 / API-005 publish new ones
// about 15 minutes after submitting).

const REQUESTS = '/services/deal-onboarding/deals/dataroom-access-request';
const dealsQuery = slug => ({ proxy_product_id: slug, proxy_usecase_id: 'deals' });

async function listRequests(session, direction) {
  const { body } = await session.get(`${REQUESTS}/${direction}`, { params: { status: 'ALL', page: 1, pageSize: 100 }, expectStatus: 200 });
  return body.items;
}

test.describe('API-007 data room requests', () => {
  let owner;
  let requester;
  test.beforeAll(async ({ playwright }) => {
    owner = await login(await playwright.request.newContext(), DEAL_USER);
    requester = await login(await playwright.request.newContext(), DATA_ROOM_REQUESTER);
  });

  for (const slug of ASSET_GROUP_SLUGS) {
    test(`${slug}: request access to a club deal's data room, approve it, both sides see it approved`, async () => {
      // One of the owner's Published club deals that the requester hasn't asked for yet.
      const alreadyRequested = new Set((await listRequests(requester, 'sent')).map(r => r.dealId));
      const published = await searchMyDeals(owner, 'clubDeal', slug, { status: 'PUBLISHED' });
      const deal = published.find(d => !alreadyRequested.has(d.id));
      expect(deal, `a Published ${slug} club deal not yet requested by the requester`).toBeTruthy();

      // Requester: send the request.
      const { body: request } = await requester.post(`/services/deal-onboarding/deals/${deal.id}/dataroom-access-request`, {}, {
        params: dealsQuery(slug),
        expectStatus: 201,
      });
      expect(request.status).toBe('PENDING');
      expect(request.dealId).toBe(deal.id);

      // The same deal can't be requested twice.
      const duplicate = await requester.post(`/services/deal-onboarding/deals/${deal.id}/dataroom-access-request`, {}, { params: dealsQuery(slug) });
      expect(duplicate.status, 'second request for the same deal').toBeGreaterThanOrEqual(400);

      // Owner: the request arrives as pending, from the requester's organisation.
      let received;
      await expect(async () => {
        received = (await listRequests(owner, 'receive')).find(r => r.id === request.id);
        expect(received, 'request in the owner\'s Received list').toBeTruthy();
      }).toPass({ timeout: 30000, intervals: [2000, 5000] });
      expect(received.status).toBe('PENDING');
      expect(received.dealName).toBe(deal.dealName);
      expect(received.counterpartyOrgName).toBe(request.requestedOrgName);

      // Owner: approve.
      const { body: grant } = await owner.post(`/services/deal-onboarding/deals/dataroom-access/by-deal/${deal.id}`, {
        accessRequestId: request.id,
        remark: 'Approved by API test',
      }, { params: dealsQuery(slug), expectStatus: [200, 201, 202] });
      expect(grant.accessId).toBeTruthy();

      // Both sides see it approved.
      await expect(async () => {
        const sent = (await listRequests(requester, 'sent')).find(r => r.id === request.id);
        expect(sent?.status, 'status in the requester\'s Sent list').toBe('APPROVED');
        const ownerSide = (await listRequests(owner, 'receive')).find(r => r.id === request.id);
        expect(ownerSide?.status, 'status in the owner\'s Received list').toBe('APPROVED');
      }).toPass({ timeout: 60000, intervals: [3000, 5000, 10000] });
      console.log(`${slug}: data room access to ${deal.dealName} requested and approved`);
    });
  }
});
