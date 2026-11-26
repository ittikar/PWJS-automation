import { test, expect } from '@playwright/test';
import { API_BASE_URL, REDIRECT_URI, login } from './helpers/apiClient';
import { DEAL_USER, DATA_ROOM_REQUESTER } from './helpers/testData';
import { dealPayload } from './helpers/deals';


test.describe('API-001 login and session', () => {
  for (const [label, user] of [['deal user', DEAL_USER], ['data room requester', DATA_ROOM_REQUESTER]]) {
    test(`${label} signs in and reads their profile`, async ({ request }) => {
      const session = await login(request, user);

      // The organisation chosen at login is an onboarded one, managed by this user.
      expect(session.organisation.org_ref_id).toBeTruthy();
      expect(session.organisation.org_onboarding_status).toBe('APPROVED');
      expect(['root', 'admin']).toContain(session.organisation.role);

      const { body } = await session.get('/profile', { expectStatus: 200 });
      expect(body.profile.email).toBe(user.email);
      expect(body.profile.userId).toBeTruthy();
    });
  }

  test('a wrong password is rejected by Cognito', async ({ request }) => {
    await expect(login(request, { ...DEAL_USER, password: `${DEAL_USER.password}-wrong` })).rejects.toThrow(
      /NotAuthorizedException/
    );
  });

  test('calls without a session token are refused', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/profile`, { headers: { 'redirect-uri': REDIRECT_URI } });
    expect([401, 403]).toContain(response.status());
  });

  test('a made-up session token is refused', async ({ request }) => {
    const response = await request.get(`${API_BASE_URL}/profile`, {
      headers: { 'session-token': 'not-a-real-token', 'redirect-uri': REDIRECT_URI },
    });
    expect([401, 403]).toContain(response.status());
  });

  test('writes without an idempotency key are rejected', async ({ request }) => {
    const session = await login(request, DEAL_USER);
    // A complete, valid payload: the missing header is the only problem.
    const { status, body } = await session.call('POST', '/services/deal-onboarding/portfolios-compliance', {
      data: await dealPayload(session, 'portfolio', 'private-equity'),
      idempotencyKey: false,
    });
    expect(status).toBe(400);
    expect(body.code).toBe('VALIDATION_ERROR');
  });
});
