import fs from 'fs';
import path from 'path';
const TEST_DATA_DIR = path.join(process.cwd(), 'test-data');
function finalFilePathFor(fileName) {
  return path.join(TEST_DATA_DIR, fileName);
}

// Each asset group's result is written to its own file rather than sharing one mutable
// JSON array. A read-modify-write on a single shared file is a race: two tests' calls can
// each read the array before the other has written, and whichever writes last silently
// drops the other's entry. Separate files per asset group have no shared state to race on.
function stagingDirFor(fileName) {
  return path.join(TEST_DATA_DIR, '.deal-results', fileName.replace(/\.json$/, ''));
}

// Clears out any results from a previous run so a stale "SUCCESS" from an earlier
// invocation can't make this run's coverage check pass falsely.
export function resetDealResults(fileName) {
  const dir = stagingDirFor(fileName);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

export function recordDealResult(fileName, assetGroup, result) {
  const dir = stagingDirFor(fileName);
  fs.mkdirSync(dir, { recursive: true });

  const entry = { assetGroup, ...result, timestamp: new Date().toISOString() };
  fs.writeFileSync(path.join(dir, `${assetGroup}.json`), JSON.stringify(entry, null, 2));
}

// Merges every expected asset group's staged result into the final consolidated file in
// test-data/, then confirms each one actually succeeded. Throws with the specific
// missing/failed groups named, rather than a generic assertion.
export function assertAllAssetGroupsCovered(fileName, expectedAssetGroups) {
  const dir = stagingDirFor(fileName);

  const results = expectedAssetGroups
    .map(assetGroup => {
      const entryPath = path.join(dir, `${assetGroup}.json`);
      return fs.existsSync(entryPath) ? JSON.parse(fs.readFileSync(entryPath, 'utf8')) : null;
    })
    .filter(Boolean);

  fs.writeFileSync(finalFilePathFor(fileName), JSON.stringify(results, null, 2));

  // The staging files have now been merged into the consolidated file above; remove them
  // so they don't linger in test-data/ between runs (resetDealResults recreates the
  // directory fresh next time this suite runs anyway). Also remove the shared parent
  // staging folder once it's empty, rather than leaving an empty directory behind.
  fs.rmSync(dir, { recursive: true, force: true });
  const stagingRoot = path.join(TEST_DATA_DIR, '.deal-results');
  if (fs.existsSync(stagingRoot) && fs.readdirSync(stagingRoot).length === 0) {
    fs.rmdirSync(stagingRoot);
  }

  const succeeded = new Set(results.filter(r => r.status === 'SUCCESS').map(r => r.assetGroup));
  const missing = expectedAssetGroups.filter(group => !succeeded.has(group));

  if (missing.length > 0) {
    throw new Error(`Creation not confirmed for asset group(s): ${missing.join(', ')}`);
  }
}
