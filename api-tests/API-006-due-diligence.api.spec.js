import { test, expect } from '@playwright/test';
import { login } from './helpers/apiClient';
import { DEAL_TYPES } from './helpers/dataRoom';
import { createDraft, searchMyDeals } from './helpers/deals';
import { ASSET_GROUP_SLUGS, DEAL_USER } from './helpers/testData';

// Due diligence on the deal user's own Published portfolios and opportunities, in every asset
// group: it starts, the deal then reports DD_IN_PROGRESS, a second start is refused while it runs,
// and it can't be run on a deal that isn't published. Submitted deals are published about 15
// minutes later, so a group fails if it has no Published deal that can run DD yet.

const runDdPath = (dealType, complianceId) => `/services/deal-onboarding/${DEAL_TYPES[dealType].compliance}/${complianceId}/run-dd`;

// The first own Published deal in the group that can run DD now (none running, not blocked).
async function findDealReadyForDd(session, dealType, slug) {
  const published = await searchMyDeals(session, dealType, slug, { status: 'PUBLISHED' });
  for (const deal of published) {
    const { body } = await session.get(runDdPath(dealType, deal.complianceId), { expectStatus: 200 });
    if (body.canRunDd && !body.activeRun) return deal;
  }
  return null;
}

test.describe('API-006 due diligence', () => {
  let session;
  test.beforeAll(async ({ playwright }) => {
    session = await login(await playwright.request.newContext(), DEAL_USER);
  });

  for (const dealType of ['portfolio', 'opportunity']) {
    for (const slug of ASSET_GROUP_SLUGS) {
      test(`${dealType} in ${slug}: due diligence starts on a published deal`, async () => {
        const deal = await findDealReadyForDd(session, dealType, slug);
        expect(deal, `an own Published ${dealType} in ${slug} that can run due diligence`).toBeTruthy();

        const { body: started } = await session.post(runDdPath(dealType, deal.complianceId), {}, { expectStatus: 200 });
        expect(started.status).toBe('DD_RUN_STARTED');
        expect(started.ddProcessId).toBeTruthy();

        const { body: state } = await session.get(runDdPath(dealType, deal.complianceId), { expectStatus: 200 });
        expect(state.canRunDd).toBe(false);
        expect(state.blockedReason).toBe('DD_IN_PROGRESS');
        expect(state.activeRun?.ddProcessId).toBe(started.ddProcessId);

        // The timeline catches up a moment later.
        await expect(async () => {
          const { body: timeline } = await session.get(
            `/services/deal-onboarding/${DEAL_TYPES[dealType].compliance}/${deal.complianceId}/status-timeline`,
            { expectStatus: 200 }
          );
          const statuses = timeline.tracks.map(t => t.currentStatus);
          expect(statuses.some(s => ['DD_STARTED', 'DD_IN_PROGRESS'].includes(s)), `timeline ${statuses}`).toBe(true);
        }).toPass({ timeout: 30000, intervals: [2000, 5000] });

        // Only one run at a time.
        const again = await session.post(runDdPath(dealType, deal.complianceId), {});
        expect(again.status, 'second start while running').toBe(409);
        console.log(`${slug} ${dealType}: due diligence started on ${deal.dealName}`);
      });
    }

    test(`${dealType}: due diligence can't be run on a draft`, async () => {
      const draft = await createDraft(session, dealType, 'private-equity');
      const { body: state } = await session.get(runDdPath(dealType, draft.id), { expectStatus: 200 });
      expect(state.published).toBe(false);
      expect(state.canRunDd).toBe(false);
      expect(state.blockedReason).toBe('NOT_PUBLISHED');

      const { status, body } = await session.post(runDdPath(dealType, draft.id), {});
      expect(status).toBe(404);
      expect(body.message).toMatch(/must be published/i);
    });
  }
});
