import { expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// Documents live in a separate document service. The backend hands out a short-lived token for
// one deal's data room (GET .../<id>/session), which also tells which groups may read/own files.
const DMS_URL = 'https://mondevo-connect.dms.ittikar.com/apisilloge/platform/api/rest';
// Where files are stored: the Ireland bucket, matching the account's data residency.
const S3_CONFIG_ID = 'ireland';
// The platform's generic document class; every data-room file is filed under it.
const DOCUMENT_CLASS_FOLDER_ID = 'Folder:53';

// Per deal type: the compliance path (for /session and /submit) and the data-management path.
export const DEAL_TYPES = {
  portfolio: { compliance: 'portfolios-compliance', dataManagement: 'portfolios' },
  opportunity: { compliance: 'opportunities-compliance', dataManagement: 'opportunities' },
  clubDeal: { compliance: 'deals-compliance', dataManagement: 'deals' },
};

// Opens the deal's data room, as the UI does when the Data Room Documents step loads. Submitting
// fails ("Please open the deal's data room before submitting") until this has been done.
export async function openDataRoom(session, dealType, complianceId, query = '') {
  const { compliance, dataManagement } = DEAL_TYPES[dealType];
  const { body: dataRoom } = await session.get(`/services/deal-onboarding/${compliance}/${complianceId}/session${query}`, {
    expectStatus: 200,
  });
  expect(dataRoom.token, 'data room token').toBeTruthy();
  const { body: folders } = await session.get(`/services/data-management/${dataManagement}/${complianceId}/working-folders`, {
    expectStatus: 200,
  });
  expect(folders.categories?.length, 'data room categories').toBeGreaterThan(0);
  return { ...dataRoom, categories: folders.categories };
}

// Uploads one file into a data room category, the same three calls the UI makes:
// create a dossier in the category folder, upload the content, then file a sheet that links them.
export async function uploadDocument(request, dataRoom, filePath, { categoryCode } = {}) {
  const category = categoryCode
    ? dataRoom.categories.find(c => c.categoryCode === categoryCode)
    : dataRoom.categories[0];
  const name = path.basename(filePath);
  const headers = { authorization: `Bearer ${dataRoom.token}`, 'x-s3-config-id': S3_CONFIG_ID };

  const dossier = await request.post(`${DMS_URL}/dossiers`, {
    headers,
    data: { name, folderId: category.extCategoryFolderId, propagateAclToAncestors: false },
  });
  expect(dossier.status(), `create dossier for ${name}`).toBe(200);
  const dossierId = (await dossier.json()).id;

  const content = await request.post(`${DMS_URL}/contents/upload`, {
    headers,
    params: { documentClassFolderId: DOCUMENT_CLASS_FOLDER_ID, isMain: 'true' },
    multipart: { file: { name, mimeType: 'application/pdf', buffer: fs.readFileSync(filePath) } },
  });
  expect(content.status(), `upload ${name}`).toBe(200);
  const { storageKey } = await content.json();
  expect(storageKey, `${name} stored in the ${S3_CONFIG_ID} bucket`).toMatch(new RegExp(`^${S3_CONFIG_ID}_`));

  const sheet = await request.post(`${DMS_URL}/sheets`, {
    headers,
    params: { skipHistoryTrace: 'false' },
    data: {
      folderId: DOCUMENT_CLASS_FOLDER_ID,
      properties: [],
      attachments: [{ storageKey, name, main: true }],
      dossierIds: [dossierId],
      name,
      aces: [
        { principal: dataRoom.orgReaderGroupPrincipal, permission: 'READ', propagate: true, inherited: false },
        { principal: dataRoom.orgWriterGroupPrincipal, permission: 'OWN', propagate: true, inherited: false },
      ],
    },
  });
  expect(sheet.status(), `file ${name} in ${category.categoryCode}`).toBe(200);
  return { name, dossierId, sheetId: (await sheet.json()).id, categoryCode: category.categoryCode };
}

// Lists the dossiers (one per uploaded file) in the data room's category folders.
export async function listDocuments(request, dataRoom) {
  const response = await request.post(`${DMS_URL}/dossiers/search`, {
    headers: { authorization: `Bearer ${dataRoom.token}`, 'x-s3-config-id': S3_CONFIG_ID },
    data: {
      query: {
        '@type': 'CompoundQuery',
        matchType: 'ANY',
        queries: dataRoom.categories.map(c => ({ '@type': 'EqualQuery', attribute: 'folderId', value: c.extCategoryFolderId })),
      },
      page: { '@type': 'OffsetLimitPage', offset: 0, size: 1000 },
    },
  });
  expect(response.status(), 'search data room documents').toBe(200);
  return (await response.json()).items.map(d => d.content.name);
}
