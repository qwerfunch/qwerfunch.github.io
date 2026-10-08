import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

import {
  CANONICAL_BASE,
  LEGACY_PREFIX,
  forwardLegacyLocation,
  relayTarget,
} from '../logcat-on-releases/relay.js';

const canonical = 'https://purpleeddy.github.io/logcat-on-releases/';

test('both exact legacy folder forms forward to the canonical trailing-slash URL', () => {
  assert.equal(LEGACY_PREFIX, '/logcat-on-releases');
  assert.equal(CANONICAL_BASE, canonical);
  assert.equal(relayTarget({ pathname: '/logcat-on-releases' }), canonical);
  assert.equal(relayTarget({ pathname: '/logcat-on-releases/' }), canonical);
});

for (const suffix of [
  'download/windows',
  'release/v1.4.0/',
  'assets/app.js',
  'assets/screenshot-hero.jpg',
  'data/releases.sample.json',
  'video/record-signal.mp4',
  'robots.txt',
  'sitemap.xml',
  '%E6%97%A5%E6%9C%AC%E8%AA%9E',
  'downloads/Windows%20portable.zip',
]) {
  test(`preserves the ${suffix} suffix, language query, and fragment`, () => {
    const target = relayTarget({
      pathname: `/logcat-on-releases/${suffix}`,
      search: '?lang=ja&view=release%20notes',
      hash: '#v1.4.0',
    });
    assert.equal(target, `${canonical}${suffix}?lang=ja&view=release%20notes#v1.4.0`);
  });
}

for (const pathname of [
  '/',
  '/not-found',
  '/other/sitemap.xml',
  '/logcat-on-releases-other',
  '/logcat-on-releases-other/download',
  '/logcat-on-releases.old',
  '/logcat-on-releases%2Fassets/app.js',
  '/LOGCAT-ON-RELEASES/',
  '//logcat-on-releases/',
  '/logcat-on-releases//evil.test/',
  '/logcat-on-releases/\\evil.test',
  '/logcat-on-releases/./assets/app.js',
  '/logcat-on-releases/../other',
  '/logcat-on-releases/%2e/assets/app.js',
  '/logcat-on-releases/.%2E/other',
  '/logcat-on-releases/%2F%2Fevil.test',
  '/logcat-on-releases/%5c%5cevil.test',
  '/logcat-on-releases/%00file',
  '/logcat-on-releases/%0Afile',
  '/logcat-on-releases/%',
  '/logcat-on-releases/a?redirect=evil',
  '/logcat-on-releases/a#fragment',
]) {
  test(`rejects nonmatching or unsafe pathname ${JSON.stringify(pathname)}`, () => {
    assert.equal(relayTarget({ pathname, search: '?lang=ko', hash: '#download' }), null);
  });
}

test('query and hash contents cannot change the redirect origin', () => {
  const search = '?next=https://evil.test/&redirect=//evil.test';
  const hash = '#//evil.test';
  const target = relayTarget({ pathname: '/logcat-on-releases/download', search, hash });
  assert.equal(target, `${canonical}download${search}${hash}`);
  assert.equal(new URL(target).origin, 'https://purpleeddy.github.io');
});

test('malformed URL components fail closed', () => {
  for (const parts of [
    {},
    { pathname: 1 },
    { pathname: '/logcat-on-releases', search: 'lang=ko' },
    { pathname: '/logcat-on-releases', search: '?lang=ko#broken' },
    { pathname: '/logcat-on-releases', search: '?lang=ko\n' },
    { pathname: '/logcat-on-releases', hash: 'download' },
    { pathname: '/logcat-on-releases', hash: '#download\0' },
    { pathname: '/logcat-on-releases', search: 1 },
  ]) {
    assert.equal(relayTarget(parts), null);
  }
});

function browserState(pathname, search = '', hash = '') {
  const replacements = [];
  const elements = {
    'not-found': { hidden: false },
    'legacy-redirect': { hidden: true },
    'legacy-redirect-link': { href: canonical },
  };
  return {
    elements,
    replacements,
    location: { pathname, search, hash, replace: (url) => replacements.push(url) },
    document: { title: '404 — Page not found', getElementById: (id) => elements[id] ?? null },
  };
}

test('forwarding updates the fallback link and replaces a matching location once', () => {
  const state = browserState('/logcat-on-releases/assets/app.js', '?lang=zh-CN', '#file');
  const target = `${canonical}assets/app.js?lang=zh-CN#file`;
  assert.equal(forwardLegacyLocation(state.location, state.document), true);
  assert.equal(state.elements['legacy-redirect-link'].href, target);
  assert.deepEqual(state.replacements, [target]);
});

test('nonmatching locations leave normal root-site behavior and DOM untouched', () => {
  let reads = 0;
  let replacements = 0;
  const location = { pathname: '/blog', replace: () => replacements++ };
  const document = { getElementById: () => { reads++; throw new Error('unexpected DOM access'); } };
  assert.equal(forwardLegacyLocation(location, document), false);
  assert.equal(reads, 0);
  assert.equal(replacements, 0);
});

test('a missing fallback element does not prevent forwarding', () => {
  const state = browserState('/logcat-on-releases/');
  assert.equal(forwardLegacyLocation(state.location, { getElementById: () => null }), true);
  assert.deepEqual(state.replacements, [canonical]);
});

test('a failed automatic navigation retains a usable suffix-preserving fallback link', () => {
  const state = browserState('/logcat-on-releases/download', '?lang=ko', '#windows');
  state.location.replace = () => { throw new Error('navigation unavailable'); };
  assert.throws(() => forwardLegacyLocation(state.location, state.document), /navigation unavailable/);
  assert.equal(state.elements['legacy-redirect-link'].href, `${canonical}download?lang=ko#windows`);
});

function runPageScript(relativePath, state) {
  const html = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  const inlineModule = /<script type="module">([\s\S]*?)<\/script>/.exec(html)?.[1];
  assert.ok(inlineModule, `${relativePath} must execute the shared relay`);
  const script = inlineModule.replace(/^\s*import\s+\{[^}]+\}\s+from\s+['"][^'"]+['"];\s*$/gm, '');
  runInNewContext(script, {
    relayTarget,
    forwardLegacyLocation,
    window: { location: state.location },
    document: state.document,
  });
}

test('the root 404 handler forwards a deep legacy link and reveals its fallback', () => {
  const state = browserState('/logcat-on-releases/releases/v1.4.0/', '?lang=en', '#notes');
  runPageScript('../404.html', state);
  assert.equal(state.document.title, 'LogcatOn has moved');
  assert.equal(state.elements['not-found'].hidden, true);
  assert.equal(state.elements['legacy-redirect'].hidden, false);
  assert.deepEqual(state.replacements, [`${canonical}releases/v1.4.0/?lang=en#notes`]);
});

test('the root 404 handler retains its page for an unrelated or lookalike route', () => {
  for (const path of ['/missing', '/logcat-on-releases-other', '/logcat-on-releases%2Fassets']) {
    const state = browserState(path, '?lang=ja', '#x');
    runPageScript('../404.html', state);
    assert.equal(state.document.title, '404 — Page not found');
    assert.equal(state.elements['not-found'].hidden, false);
    assert.equal(state.elements['legacy-redirect'].hidden, true);
    assert.deepEqual(state.replacements, []);
  }
});

test('the forwarding folder executes the relay with the query and fragment intact', () => {
  const state = browserState('/logcat-on-releases/', '?lang=ko', '#downloads');
  runPageScript('../logcat-on-releases/index.html', state);
  assert.deepEqual(state.replacements, [`${canonical}?lang=ko#downloads`]);
});
