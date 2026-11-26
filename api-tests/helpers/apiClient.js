import { expect } from '@playwright/test';
import crypto from 'crypto';

// The Ittikar backend, called directly (no browser). ITTI_ENV picks the environment (sit by default).
const ENVIRONMENTS = {
  sit: {
    apiBaseUrl: 'https://c2zr8ds89i.execute-api.eu-west-1.amazonaws.com/sit/v1/dashboard',
    redirectUri: 'https://sit-ireland-dashboard.ittikar.com/auth',
    cognitoClientId: '7uli8ahgv0cphen9k6h64augg8',
  },
  dev: {
    apiBaseUrl: 'https://qf6h60vgzc.execute-api.eu-west-1.amazonaws.com/dev/v1/dashboard',
    redirectUri: 'https://dev-ireland-dashboard.ittikar.com/auth',
    cognitoClientId: '2m6q80ld1go9u2ohg30n7q6sv8',
  },
};
export const ITTI_ENV = process.env.ITTI_ENV || 'sit';
const ENV = ENVIRONMENTS[ITTI_ENV];
if (!ENV) throw new Error(`Unknown ITTI_ENV "${ITTI_ENV}". Use one of: ${Object.keys(ENVIRONMENTS).join(', ')}`);
export const API_BASE_URL = ENV.apiBaseUrl;
export const REDIRECT_URI = ENV.redirectUri;

// The dashboard's Cognito app client, which allows a plain username/password login.
const COGNITO_URL = 'https://cognito-idp.eu-west-1.amazonaws.com/';
const COGNITO_CLIENT_ID = ENV.cognitoClientId;

// Signs in the way the dashboard does, then returns an ApiSession for that user:
//  1. Cognito password login -> ID and access tokens.
//  2. GET /app-metadata with session-token = base64({ id_token, access_token }) -> the session token
//     (the access token) and the user's organisations.
//  3. POST /preferences/login with the organisation -> from then on, calls with
//     session-token: <access token> are allowed (without this step they get 403).
// `request` is Playwright's APIRequestContext (the `request` fixture).
export async function login(request, { email, password }, { orgRefId } = {}) {
  const cognito = await request.post(COGNITO_URL, {
    headers: {
      'content-type': 'application/x-amz-json-1.1',
      'x-amz-target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    },
    data: JSON.stringify({
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: COGNITO_CLIENT_ID,
      // The Cognito username is the SHA-256 of the lowercased email, as the app's own sign-in sends
      // it (itti-revamped computeUserId). Logging in by email only works where the email is verified.
      AuthParameters: { USERNAME: cognitoUsername(email), PASSWORD: password },
    }),
  });
  const cognitoBody = await cognito.json();
  if (!cognito.ok()) {
    throw new Error(`Cognito login for ${email} failed: ${cognito.status()} ${cognitoBody.__type ?? ''} ${cognitoBody.message ?? ''}`);
  }
  const { IdToken, AccessToken } = cognitoBody.AuthenticationResult;

  const bundle = Buffer.from(JSON.stringify({ id_token: IdToken, access_token: AccessToken })).toString('base64');
  const metaResponse = await request.get(`${API_BASE_URL}/app-metadata`, {
    headers: { 'session-token': bundle, 'redirect-uri': REDIRECT_URI },
  });
  expect(metaResponse.status(), 'GET /app-metadata').toBe(200);
  const meta = await metaResponse.json();

  // Without an explicit org, prefer an onboarded (APPROVED) one, as the app's sign-in does: a user
  // can also belong to draft organisations, which may only read deals.
  const organisation = orgRefId
    ? meta.organisations.find(o => o.org_ref_id === orgRefId)
    : meta.organisations.find(o => o.org_onboarding_status === 'APPROVED') ?? meta.organisations[0];
  if (!organisation) throw new Error(`${email} has no organisation${orgRefId ? ` ${orgRefId}` : ''}`);

  const session = new ApiSession(request, { email, sessionToken: meta.sessionToken, organisation, organisations: meta.organisations });
  await session.post('/preferences/login', { org_ref_id: organisation.org_ref_id }, { expectStatus: 200 });
  return session;
}

function cognitoUsername(email) {
  return crypto.createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
}

// A signed-in user. Paths are relative to API_BASE_URL (e.g. '/profile'), or absolute URLs.
export class ApiSession {
  constructor(request, { email, sessionToken, organisation, organisations }) {
    this.request = request;
    this.email = email;
    this.sessionToken = sessionToken;
    this.organisation = organisation;
    this.organisations = organisations;
  }

  headers(extra = {}) {
    return { 'session-token': this.sessionToken, 'redirect-uri': REDIRECT_URI, ...extra };
  }

  url(path) {
    return path.startsWith('http') ? path : `${API_BASE_URL}${path}`;
  }

  // Sends the call and returns { status, body, response }. With `expectStatus`, fails the test
  // (naming the call and showing the response) when the status differs.
  async call(method, path, { data, params, headers, multipart, expectStatus, idempotencyKey = true } = {}) {
    // Every write needs its own idempotency key; without it the backend answers 400
    // VALIDATION_ERROR ("We couldn't process this request safely"). `idempotencyKey: false`
    // leaves it out, for negative tests.
    const writeHeaders = method !== 'GET' && idempotencyKey ? { 'x-idempotency-key': crypto.randomUUID() } : {};
    const response = await this.request.fetch(this.url(path), {
      method,
      params,
      headers: this.headers({ ...writeHeaders, ...headers }),
      ...(multipart ? { multipart } : data !== undefined ? { data } : {}),
    });
    const text = await response.text();
    let body = text;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // not JSON; keep the text
    }
    if (expectStatus !== undefined) {
      const expected = [].concat(expectStatus);
      expect(expected, `${method} ${path} -> ${response.status()} ${text.slice(0, 300)}`).toContain(response.status());
    }
    return { status: response.status(), body, response };
  }

  get(path, options) {
    return this.call('GET', path, options);
  }

  post(path, data, options = {}) {
    return this.call('POST', path, { ...options, data });
  }

  patch(path, data, options = {}) {
    return this.call('PATCH', path, { ...options, data });
  }
}
