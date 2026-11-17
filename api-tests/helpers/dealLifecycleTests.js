import { test, expect } from '@playwright/test';
import { login } from './apiClient';
import { DEAL_TYPES } from './dataRoom';
import { createDraft, expectListed, submitDeal } from './deals';
import { ASSET_GROUP_SLUGS, DEAL_USER } from './testData';

// The same scenarios for portfolios and opportunities, in every asset group:
//  - a draft is created in the right asset group and listed with status DRAFT;
//  - a deal is created, its data room opened, documents uploaded and listed, then submitted,
//    and it is listed with a non-draft status;
//  - submitting before the data room is opened is refused.
export function defineDealLifecycleTests(id, dealType) {
  test.describe(`${id} ${dealType} lifecycle`, () => {
    let session;
    test.beforeAll(async ({ playwright }) => {
      session = await login(await playwright.request.newContext(), DEAL_USER);
    });

    for (const slug of ASSET_GROUP_SLUGS) {
      test(`${slug}: draft is saved and listed`, async () => {
        const draft = await createDraft(session, dealType, slug);
        const listed = await expectListed(session, dealType, slug, draft.dealName);
        expect(listed.status).toBe('DRAFT');
        console.log(`${slug} ${dealType} draft: ${draft.dealName}`);
      });

      test(`${slug}: deal is submitted with documents and listed`, async ({ request }) => {
        const draft = await createDraft(session, dealType, slug);
        const { files } = await submitDeal(session, request, dealType, slug, draft);
        const listed = await expectListed(session, dealType, slug, draft.dealName);
        expect(listed.status, `${draft.dealName} listed status`).not.toBe('DRAFT');
        console.log(`${slug} ${dealType} submitted: ${draft.dealName} (${listed.status}), files: ${files.join(', ')}`);
      });
    }

    test('submitting before the data room is opened is refused', async () => {
      const slug = 'private-equity';
      const draft = await createDraft(session, dealType, slug);
      const { compliance } = DEAL_TYPES[dealType];
      const { status, body } = await session.patch(`/services/deal-onboarding/${compliance}/${draft.id}/submit`, {
        version: draft.version,
      });
      expect(status).toBe(422);
      expect(body.message).toMatch(/open the deal.s data room/i);
    });
  });
}
