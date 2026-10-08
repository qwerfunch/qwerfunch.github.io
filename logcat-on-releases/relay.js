// This Pages relay only handles the former website. GitHub release and updater
// URLs continue through GitHub's repository-transfer redirects.
export const LEGACY_PREFIX = '/logcat-on-releases';
export const CANONICAL_BASE = 'https://purpleeddy.github.io/logcat-on-releases/';

function safePath(pathname) {
  if (pathname.includes('//') || /[\\\u0000-\u0020\u007f?#]/.test(pathname)) return false;
  return pathname.split('/').every((segment) => {
    try {
      const decoded = decodeURIComponent(segment);
      return decoded !== '.' && decoded !== '..' && !/[/\\\u0000-\u001f\u007f]/.test(decoded);
    } catch {
      return false;
    }
  });
}

// Accepts window.location or a URL-shaped object, without reading browser state.
// Prefix matching is deliberately slash-delimited; similarly named root routes
// must remain 404s. A fixed destination prevents query values from changing host.
export function relayTarget({ pathname, search = '', hash = '' } = {}) {
  if (typeof pathname !== 'string' ||
      (pathname !== LEGACY_PREFIX && !pathname.startsWith(`${LEGACY_PREFIX}/`)) ||
      !safePath(pathname)) return null;
  if (typeof search !== 'string' || typeof hash !== 'string' ||
      (search && !search.startsWith('?')) || (hash && !hash.startsWith('#')) ||
      search.includes('#') || /[\u0000-\u001f\u007f]/.test(search + hash)) return null;

  const suffix = pathname === LEGACY_PREFIX ? '' : pathname.slice(LEGACY_PREFIX.length + 1);
  return `${CANONICAL_BASE}${suffix}${search}${hash}`;
}

export function forwardLegacyLocation(location, document) {
  const target = relayTarget(location);
  if (!target) return false;
  const link = document?.getElementById('legacy-redirect-link');
  if (link) link.href = target;
  location.replace(target);
  return true;
}
