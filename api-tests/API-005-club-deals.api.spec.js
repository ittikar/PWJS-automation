import { test, expect } from '@playwright/test';
import { login } from './helpers/apiClient';
import { clubDealQuery, createDraft, expectListed, submitDeal } from './helpers/deals';
import { ASSET_GROUP_SLUGS, DEAL_USER, KYB_DATA } from './helpers/testData';
import { approveApplicant, getApplicant, sumsubRequest } from '../utils/sumsubApi';

// Club deals in every asset group:
//  - a draft;
//  - a deal submitted with documents and no participants;
//  - a deal with a participant organisation whose company verification (KYB) is launched, found in
//    Sumsub, approved there, and then shown as approved by the app.
// The participant part needs SUMSUB_APP_TOKEN and SUMSUB_SECRET_KEY in .env.

const participantsPath = dealId => `/services/deal-onboarding/deals-compliance/${dealId}/participants`;

function participantData() {
  const stamp = `${Date.now()}`;
  return {
    companyName: `API ${KYB_DATA.participant.companyNamePrefix} ${stamp}`,
    countryAlpha3: 'IND',
    // A valid Indian CIN: Sumsub checks the format for India.
    regNumber: KYB_DATA.participant.registrationNumberPrefix + stamp.slice(-6),
  };
}

test.describe('API-005 club deals', () => {
  let session;
  test.beforeAll(async ({ playwright }) => {
    session = await login(await playwright.request.newContext(), DEAL_USER);
  });

  for (const slug of ASSET_GROUP_SLUGS) {
    test(`${slug}: draft is saved and listed`, async () => {
      const draft = await createDraft(session, 'clubDeal', slug);
      expect(draft.settlementType).toBeTruthy();
      const listed = await expectListed(session, 'clubDeal', slug, draft.dealName);
      expect(listed.status).toBe('DRAFT');
      console.log(`${slug} club deal draft: ${draft.dealName}`);
    });

    test(`${slug}: deal without participants is submitted and listed`, async ({ request }) => {
      const draft = await createDraft(session, 'clubDeal', slug);
      const { body: participants } = await session.get(participantsPath(draft.id), { params: clubDealQuery(slug), expectStatus: 200 });
      expect(participants).toEqual([]);

      await submitDeal(session, request, 'clubDeal', slug, draft);
      const listed = await expectListed(session, 'clubDeal', slug, draft.dealName);
      expect(listed.status).not.toBe('DRAFT');
      console.log(`${slug} club deal submitted: ${draft.dealName} (${listed.status})`);
    });

    test(`${slug}: deal with a participant, verified and approved in Sumsub`, async ({ request }) => {
      const draft = await createDraft(session, 'clubDeal', slug);

      // Add the participant: saved with status KYB_PENDING and no Sumsub applicant yet.
      const data = participantData();
      const { body: participant } = await session.post(participantsPath(draft.id), data, {
        params: clubDealQuery(slug),
        expectStatus: 201,
      });
      expect(participant.status).toBe('KYB_PENDING');
      expect(participant.complianceProviderId).toBeNull();
      expect(participant.companyName).toBe(data.companyName);

      // Verification can only start once the deal is submitted.
      const early = await session.post(`${participantsPath(draft.id)}/${participant.id}/launch-kyc`, {}, { params: clubDealQuery(slug) });
      expect(early.status, 'launch-kyc before submit').toBe(422);

      await submitDeal(session, request, 'clubDeal', slug, draft);

      // Launching KYB creates the Sumsub company applicant for this participant.
      const { body: launch } = await session.post(`${participantsPath(draft.id)}/${participant.id}/launch-kyc`, {}, {
        params: clubDealQuery(slug),
        expectStatus: 200,
      });
      expect(launch.token, 'Sumsub access token for the widget').toBeTruthy();

      let applicant;
      await expect(async () => {
        applicant = await sumsubRequest(request, 'GET', `/resources/applicants/-;externalUserId=${participant.id}/one`);
      }).toPass({ timeout: 30000, intervals: [2000, 5000] });
      expect(applicant.type).toBe('company');
      expect(applicant.fixedInfo?.companyInfo?.companyName ?? applicant.info?.companyInfo?.companyName).toBe(data.companyName);

      const readParticipant = async () => {
        const { body } = await session.get(participantsPath(draft.id), { params: clubDealQuery(slug), expectStatus: 200 });
        return body.find(p => p.id === participant.id);
      };
      await expect(async () => {
        expect((await readParticipant()).complianceProviderId, 'participant linked to the applicant').toBe(applicant.id);
      }).toPass({ timeout: 30000, intervals: [2000, 5000] });

      // Approve in Sumsub; the app picks the decision up.
      await approveApplicant(request, applicant.id);
      await expect(async () => {
        const approved = await getApplicant(request, applicant.id);
        expect(approved.review?.reviewResult?.reviewAnswer).toBe('GREEN');
      }).toPass({ timeout: 60000, intervals: [5000] });
      await expect(async () => {
        expect((await readParticipant()).status, 'participant status in the app').toBe('KYB_PROVIDER_APPROVED');
      }).toPass({ timeout: 90000, intervals: [5000, 10000] });

      const listed = await expectListed(session, 'clubDeal', slug, draft.dealName);
      expect(listed.status).not.toBe('DRAFT');
      console.log(`${slug} club deal with participant: ${draft.dealName} (${listed.status}), participant "${data.companyName}" KYB_PROVIDER_APPROVED, Sumsub ${applicant.id}`);
    });
  }

  test('a participant needs a company name, country and registration number', async () => {
    const draft = await createDraft(session, 'clubDeal', 'private-equity');
    const { status } = await session.post(participantsPath(draft.id), { countryAlpha3: 'IND' }, { params: clubDealQuery('private-equity') });
    expect([400, 422]).toContain(status);
  });
});
