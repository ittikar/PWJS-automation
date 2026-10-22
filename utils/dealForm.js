import fs from 'fs';
import path from 'path';

export function pickRandomFiles(count, dir = path.join(process.cwd(), 'dataroom')) {
  const files = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.pdf'));
  const shuffled = files.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map(f => path.join(dir, f));
}
