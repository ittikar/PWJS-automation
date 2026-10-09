import fs from 'fs';
import path from 'path';

export function writeSignupResult(fileName, newData) {

  const filePath = path.join(
    process.cwd(),
    'test-data',
    fileName
  );

  fs.writeFileSync(
    filePath,
    JSON.stringify([newData], null, 2)
  );
}