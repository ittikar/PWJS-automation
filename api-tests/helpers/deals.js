import { expect } from '@playwright/test';
import { DEAL_TYPES, openDataRoom, uploadDocument, listDocuments } from './dataRoom';
import { apiDealName, assetGroupCode, pickDataRoomFiles, randomItem } from './testData';

// Per deal type: the reference-data module, the name used in deal names, and the
// proxy_usecase_id the UI sends for searches. Club deal calls also carry
// proxy_product_id=<asset group slug>&proxy_usecase_id=deals-compliance.
const TYPE_INFO = {
  portfolio: { refData: 'portfolio', label: 'Portfolio', search: 'portfolios' },
  opportunity: { refData: 'opportunity', label: 'Opportunity', search: 'opportunities' },
  clubDeal: { refData: 'club-deal', label: 'Club Deal', search: 'deals' },
};

const COUNTRIES = ['IND', 'IRL', 'GBR', 'SGP', 'ARE', 'USA', 'DEU', 'FRA'];

const refDataCache = new Map();

export async function referenceData(session, module) {
  if (!refDataCache.has(module)) {
    const { body } = await session.get(`/ref-data/${module}`, { params: { locale: 'en' }, expectStatus: 200 });
    refDataCache.set(module, body.lookups);
  }
  return refDataCache.get(module);
}

// The query the UI adds to club deal (deals-compliance) calls.
export function clubDealQuery(slug) {
  return { proxy_product_id: slug, proxy_usecase_id: 'deals-compliance' };
}

function complianceParams(dealType, slug) {
  return dealType === 'clubDeal' ? clubDealQuery(slug) : undefined;
}

// A valid create payload for this asset group: one of the group's own asset classes, and a random
// sector, nature of deal and country (plus amounts and settlement type for club deals).
export async function dealPayload(session, dealType, slug) {
  const lookups = await referenceData(session, TYPE_INFO[dealType].refData);
  const group = lookups.assetGroup.items.find(g => g.code === assetGroupCode(slug));
  expect(group, `asset group ${slug} in ref-data`).toBeTruthy();

  const payload = {
    dealName: apiDealName(TYPE_INFO[dealType].label),
    assetClass: randomItem(group.assetClass.filter(c => c.uiRender !== false)).code,
    sector: randomItem(lookups.sector.items.filter(s => s.code !== 'ANY')).code,
    natureOfDeal: randomItem(lookups.natureOfDeal.items).code,
    countryAlpha3: randomItem(COUNTRIES),
  };
  if (dealType === 'clubDeal') {
    payload.settlementType = randomItem(lookups.settlementType.items).code;
    payload.targetInvestmentAmountUsd = (Math.floor(Math.random() * 95) + 5) * 1_000_000;
    payload.minimumTicketSizeUsd = (Math.floor(Math.random() * 19) + 1) * 50_000;
  }
  return payload;
}

// Creates a deal (status DRAFT) and checks the backend filed it under the right asset group.
export async function createDraft(session, dealType, slug, overrides = {}) {
  const payload = { ...(await dealPayload(session, dealType, slug)), ...overrides };
  const { compliance } = DEAL_TYPES[dealType];
  const { body } = await session.post(`/services/deal-onboarding/${compliance}`, payload, {
    params: complianceParams(dealType, slug),
    expectStatus: 201,
  });
  expect(body.status, `${payload.dealName} status`).toBe('DRAFT');
  expect(body.dealName, 'deal name (stored in capitals)').toBe(payload.dealName.toUpperCase());
  expect(body.assetClass).toBe(payload.assetClass);
  if (body.assetGroupCode) expect(body.assetGroupCode, `${payload.dealName} asset group`).toBe(assetGroupCode(slug));
  return body;
}

// Opens the data room, uploads `fileCount` PDFs, checks they are listed, marks the deal
// submittable and submits it (status SUBMITTED). Returns the submitted deal and the file names.
export async function submitDeal(session, request, dealType, slug, draft, { fileCount = 2 } = {}) {
  const { compliance, dataManagement } = DEAL_TYPES[dealType];
  const query = dealType === 'clubDeal' ? `?proxy_product_id=${slug}&proxy_usecase_id=deals-compliance` : '';

  const dataRoom = await openDataRoom(session, dealType, draft.id, query);
  const uploaded = [];
  for (const file of pickDataRoomFiles(fileCount)) {
    uploaded.push((await uploadDocument(request, dataRoom, file)).name);
  }
  // The document search is indexed shortly after the upload.
  await expect(async () => {
    const listed = await listDocuments(request, dataRoom);
    for (const name of uploaded) expect(listed, `${name} listed in the data room`).toContain(name);
  }).toPass({ timeout: 30000, intervals: [1000, 2000, 5000] });

  const { body: submittable } = await session.patch(`/services/data-management/${dataManagement}/${draft.id}/submittable`, { value: true }, {
    expectStatus: 200,
  });
  expect(submittable.isSubmittable).toBe(true);

  const { body: submitted } = await session.patch(`/services/deal-onboarding/${compliance}/${draft.id}/submit`, { version: draft.version }, {
    params: complianceParams(dealType, slug),
    expectStatus: 200,
  });
  expect(submitted.status, `${draft.dealName} status after submit`).toBe('SUBMITTED');
  return { submitted, files: uploaded };
}

// Searches the user's own deals of this type in the asset group (drafts included unless a status
// filter is given). Returns the matching items.
export async function searchMyDeals(session, dealType, slug, { name, status, pageSize = 50 } = {}) {
  const clauses = [`assetGroupCode eq '${assetGroupCode(slug)}'`];
  if (status) clauses.push(`status eq '${status}'`);
  if (name) clauses.push(`dealName eq '${name.toUpperCase()}'`);
  const { search } = TYPE_INFO[dealType];
  const { body } = await session.get(`/services/deal-onboarding/${search}/search/my`, {
    params: { page: 1, pageSize, filter: clauses.join(' and '), proxy_product_id: slug, proxy_usecase_id: search },
    expectStatus: 200,
  });
  return body.items;
}

// Waits until the deal shows up in the user's own search results, and returns it.
export async function expectListed(session, dealType, slug, dealName, { timeout = 60000 } = {}) {
  let found;
  await expect(async () => {
    const items = await searchMyDeals(session, dealType, slug, { name: dealName });
    found = items.find(d => d.dealName.toUpperCase() === dealName.toUpperCase());
    expect(found, `${dealName} in the ${slug} ${dealType} search`).toBeTruthy();
  }).toPass({ timeout, intervals: [3000, 5000, 10000] });
  return found;
}
