// Standalone public-repository maintenance: no private source or application runtime is required.
const { execFileSync } = require('node:child_process');
const semver = require('semver');
const REPOSITORY = 'xheavy0/Thread-Releases';
const REPOSITORY_ID = 1407053557;

function selectRetained(releases, versionOf = (release) => semver.valid(release.tag_name)) {
  const sorted = releases
    .filter((release) => !release.draft && versionOf(release))
    .sort((a, b) => semver.rcompare(versionOf(a), versionOf(b)) || b.id - a.id);
  const stable = sorted.find((release) => !release.prerelease);
  const keep = stable ? [stable] : [];
  for (const release of sorted) if (keep.length < 2 && !keep.includes(release)) keep.push(release);
  return keep;
}

function planRetention(releases, catalog) {
  if (catalog?.schemaVersion !== 1 || !Array.isArray(catalog.apps))
    throw new Error('Invalid catalog.');
  const groups = [
    { repository: 'xheavy0/ThreadToolbox', prefix: '', enabled: true },
    ...catalog.apps.map((app) => {
      if (!/^xheavy0\/Thread[A-Za-z0-9_-]+$/.test(app.repository))
        throw new Error('Unexpected catalog repository.');
      return {
        repository: app.repository,
        prefix: app.repository.split('/')[1].toLowerCase() + '-v',
        enabled: app.publishReleases !== false,
      };
    }),
  ];
  const remove = [],
    keep = [],
    summary = [];
  for (const group of groups) {
    const versionOf = (release) =>
      semver.valid(group.prefix ? release.tag_name.slice(group.prefix.length) : release.tag_name);
    const candidates = releases.filter(
      (release) =>
        !release.draft &&
        (!group.prefix || release.tag_name.startsWith(group.prefix)) &&
        versionOf(release),
    );
    const retained = group.enabled ? selectRetained(candidates, versionOf) : [];
    keep.push(...retained);
    remove.push(...candidates.filter((release) => !retained.includes(release)));
    summary.push({
      repository: group.repository,
      retained: retained.map((release) => release.tag_name),
    });
  }
  return {
    remove,
    keep,
    summary,
    remaining: releases.filter((release) => !remove.includes(release)),
  };
}

function createIndex(catalog, releases) {
  const selected = [];
  for (const app of catalog.apps) {
    if (app.publishReleases === false) continue;
    const prefix = app.repository.split('/')[1].toLowerCase() + '-v';
    const candidates = releases
      .filter(
        (release) =>
          !release.draft &&
          release.tag_name.startsWith(prefix) &&
          semver.valid(release.tag_name.slice(prefix.length)),
      )
      .sort((a, b) =>
        semver.rcompare(a.tag_name.slice(prefix.length), b.tag_name.slice(prefix.length)),
      );
    for (const prerelease of [false, true]) {
      const release = candidates.find((entry) => entry.prerelease === prerelease);
      if (!release) continue;
      selected.push({
        repository: app.repository,
        tag_name: release.tag_name,
        body: (release.body || '').slice(0, 100_000),
        published_at: release.published_at,
        html_url: release.html_url,
        draft: false,
        prerelease,
        assets: release.assets.map(({ name, size, browser_download_url, digest }) => ({
          name,
          size,
          browser_download_url,
          digest,
        })),
      });
    }
  }
  return { schemaVersion: 1, catalog, releases: selected };
}

function signature(release) {
  return JSON.stringify([
    release.id,
    release.tag_name,
    release.draft,
    release.prerelease,
    release.assets.map(({ id, name, size, digest }) => [id, name, size, digest]),
  ]);
}

async function pruneReleases({ apply = false, request } = {}) {
  if (!request) {
    const token =
      process.env.GH_TOKEN ||
      process.env.GITHUB_TOKEN ||
      execFileSync('gh', ['auth', 'token'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
    request = async (endpoint, method = 'GET', body) => {
      const response = await fetch(`https://api.github.com/repos/${REPOSITORY}${endpoint}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'Thread-ReleaseRetention',
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok)
        throw new Error(`Release retention ${method} ${endpoint}: HTTP ${response.status}`);
      return response.status === 204 ? undefined : response.json();
    };
  }
  const metadata = await request('');
  if (
    metadata.id !== REPOSITORY_ID ||
    metadata.full_name !== REPOSITORY ||
    metadata.private ||
    metadata.default_branch !== 'main'
  )
    throw new Error('Expected the original public Thread-Releases repository on main.');
  const list = async () => {
    const releases = [];
    for (let page = 1; ; page++) {
      const batch = await request(`/releases?per_page=100&page=${page}`);
      releases.push(...batch);
      if (batch.length < 100) return releases;
    }
  };
  const readIndex = async () => {
    const file = await request('/contents/releases.json');
    return { file, index: JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')) };
  };
  const initial = await list();
  const {
    index: { catalog },
  } = await readIndex();
  const plan = planRetention(initial, catalog);
  if (!apply)
    return { apply, delete: plan.remove.map((release) => release.tag_name), apps: plan.summary };
  const publishIndex = async (releases) => {
    const { file, index } = await readIndex();
    const content = Buffer.from(
      JSON.stringify(createIndex(index.catalog, releases), null, 2) + '\n',
    ).toString('base64');
    if (file.content.replace(/\s/g, '') !== content)
      await request('/contents/releases.json', 'PUT', {
        message: 'Keep release index aligned with retained downloads',
        branch: 'main',
        sha: file.sha,
        content,
      });
  };
  const pinToolbox = async (releases) => {
    const latest = selectRetained(
      releases.filter(
        (release) => !release.prerelease && /^v?\d+\.\d+\.\d+$/.test(release.tag_name),
      ),
    )[0];
    if (!latest)
      throw new Error('A stable Toolbox release must remain available for automatic updates.');
    const current = await request('/releases/latest');
    if (current.id !== latest.id)
      await request(`/releases/${latest.id}`, 'PATCH', { make_latest: 'true' });
    return latest;
  };
  await pinToolbox(plan.remaining);
  // Remove obsolete download links before deleting their assets.
  await publishIndex(plan.remaining);
  const deleted = [];
  for (const release of plan.remove) {
    const fresh = await list();
    const { index } = await readIndex();
    const current = fresh.find((entry) => entry.id === release.id);
    if (!current) continue;
    if (!planRetention(fresh, index.catalog).remove.some((entry) => entry.id === release.id))
      continue;
    if (signature(current) !== signature(release))
      throw new Error(`${release.tag_name} changed during cleanup; refusing to delete it.`);
    if ((await request('/releases/latest')).id === release.id)
      throw new Error('Refusing to delete the active update release.');
    await request(`/releases/${release.id}`, 'DELETE');
    deleted.push(release.tag_name);
  }
  const remaining = await list();
  for (const kept of plan.keep) {
    const saved = remaining.find((entry) => entry.id === kept.id);
    if (!saved || signature(saved) !== signature(kept))
      throw new Error('A retained release changed during cleanup.');
  }
  await pinToolbox(remaining);
  await publishIndex(remaining);
  const final = planRetention(remaining, (await readIndex()).index.catalog);
  if (final.remove.length) throw new Error('Release retention is incomplete; rerun maintenance.');
  return { apply, deleted, apps: final.summary };
}

if (require.main === module)
  pruneReleases({ apply: process.argv.includes('--apply') })
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
module.exports = { selectRetained, planRetention, createIndex, pruneReleases };
