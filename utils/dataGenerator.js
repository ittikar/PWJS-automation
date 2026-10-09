import { COUNTRIES } from './countries';

const ORG_PREFIXES = [
  'Alpha', 'Beta', 'Nova', 'Zenith', 'Horizon', 'Summit', 'Vertex', 'Pinnacle',
  'Meridian', 'Atlas', 'Orion', 'Granite', 'Silverline', 'Bluepeak', 'Crestview',
];
const ORG_SUFFIXES = [
  'Capital', 'Partners', 'Holdings', 'Ventures', 'Advisors', 'Investments', 'Group',
  'Family Office', 'Wealth Management',
];

export function generateUniqueEmail() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `user${timestamp}${random}@yopmail.com`;
}

export function generateUniqueOrgName() {
  const prefix = ORG_PREFIXES[Math.floor(Math.random() * ORG_PREFIXES.length)];
  const suffix = ORG_SUFFIXES[Math.floor(Math.random() * ORG_SUFFIXES.length)];
  return `${prefix} ${suffix}`;
}

export function generateUniqueOrgRegNo() {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 10000);
  return `REG-${timestamp}${random}`;
}

export function generateRandomCountry() {
  return COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)];
}