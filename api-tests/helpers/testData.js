import fs from 'fs';
import path from 'path';

function readJson(...parts) {
  return JSON.parse(fs.readFileSync(path.join(process.cwd(), ...parts), 'utf8'));
}

// The same accounts as the UI tests: change them in test-data/.
export const DEAL_USER = readJson('test-data', 'dealUser.json');
export const DATA_ROOM_REQUESTER = readJson('test-data', 'dataRoomRequester.json');
export const KYB_DATA = readJson('test-data', 'kybData.json');

export const ASSET_GROUP_SLUGS = ['private-equity', 'real-asset', 'secondary-pre-ipo', 'private-credit', 'other-alternatives'];

// 'private-equity' -> 'PRIVATE_EQUITY', the code the backend uses.
export function assetGroupCode(slug) {
  return slug.toUpperCase().replace(/-/g, '_');
}

// PDFs in dataroom/ to upload, picked at random.
export function pickDataRoomFiles(count) {
  const dir = path.join(process.cwd(), 'dataroom');
  const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.pdf'));
  return files.sort(() => Math.random() - 0.5).slice(0, count).map(f => path.join(dir, f));
}

// Deals created by the API tests start with "API", so they can be told apart from the UI tests' deals.
export function apiDealName(kind) {
  return `API ${kind} ${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

export function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}
