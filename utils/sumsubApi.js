import crypto from 'crypto';

// Calls to the Sumsub API (sandbox), signed the way Sumsub requires: an App Token header plus an
// HMAC-SHA256 signature of timestamp + method + path + body, made with the Secret Key.
// Both come from the environment (.env locally) -- never from the repo.
const SUMSUB_BASE_URL = 'https://api.sumsub.com';

function credentials() {
  const appToken = process.env.SUMSUB_APP_TOKEN;
  const secretKey = process.env.SUMSUB_SECRET_KEY;
  if (!appToken || !secretKey) {
    throw new Error('SUMSUB_APP_TOKEN and SUMSUB_SECRET_KEY must be set (see .env.example).');
  }
  return { appToken, secretKey };
}

function signedHeaders(method, pathWithQuery, body = '') {
  const { appToken, secretKey } = credentials();
  const ts = Math.floor(Date.now() / 1000).toString();
  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(ts + method.toUpperCase() + pathWithQuery + body)
    .digest('hex');

  return {
    'X-App-Token': appToken,
    'X-App-Access-Ts': ts,
    'X-App-Access-Sig': signature,
    Accept: 'application/json',
    ...(body ? { 'Content-Type': 'application/json' } : {}),
  };
}

// `request` is Playwright's APIRequestContext (the `request` fixture, or page.request).
export async function sumsubRequest(request, method, pathWithQuery, payload) {
  const body = payload === undefined ? '' : JSON.stringify(payload);
  const response = await request.fetch(`${SUMSUB_BASE_URL}${pathWithQuery}`, {
    method,
    headers: signedHeaders(method, pathWithQuery, body),
    data: body || undefined,
  });

  const text = await response.text();
  if (!response.ok()) {
    throw new Error(`Sumsub ${method} ${pathWithQuery} failed: ${response.status()} ${text.slice(0, 500)}`);
  }
  return text ? JSON.parse(text) : null;
}

export function approveApplicant(request, applicantId) {
  // Sumsub rejects this call without a body ("The request body must not be null"); {} is enough.
  return sumsubRequest(request, 'POST', `/resources/applicants/${applicantId}/-/approve`, {});
}

export function getApplicant(request, applicantId) {
  return sumsubRequest(request, 'GET', `/resources/applicants/${applicantId}/one`);
}
