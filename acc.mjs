const API = 'https://developer.api.autodesk.com';
const TTL = 60_000;
const pdf = name => /\.pdf$/i.test(String(name || '').trim());
const deleted = entry => Boolean(entry?.attributes?.hidden || entry?.attributes?.extension?.data?.isDeleted || /deleted/i.test(entry?.attributes?.extension?.type || ''));
const nameOf = entry => entry?.attributes?.displayName || entry?.attributes?.name || '';
const segment = encodeURIComponent;

// Credentials stay on the server. Only the configured folder tree is exposed.
export function createAccSource(env = process.env, transport = fetch) {
  const enabled = env.ACC_ENABLED === 'true';
  const rawProject = env.ACC_PROJECT_ID || '';
  const projectId = rawProject.startsWith('b.') ? rawProject : `b.${rawProject}`;
  const rootId = env.ACC_ROOT_FOLDER_ID || '';
  const prefix = `/data/v1/projects/${segment(projectId)}`;
  let token, tokenExpiry = 0, tokenPending, cache, cacheTime = 0, pending;
  function configured() {
    return Boolean(env.APS_CLIENT_ID && env.APS_CLIENT_SECRET && /^b\.[a-f0-9-]{36}$/i.test(projectId) && /^urn:adsk\.wipprod:fs\.folder:/.test(rootId));
  }
  async function accessToken() {
    if (token && Date.now() < tokenExpiry) return token;
    if (tokenPending) return tokenPending;
    tokenPending = (async () => {
      const response = await transport(`${API}/authentication/v2/token`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Basic ${Buffer.from(`${env.APS_CLIENT_ID}:${env.APS_CLIENT_SECRET}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=client_credentials&scope=data%3Aread'
      });
      if (!response.ok) throw new Error(`ACC authorization failed (${response.status})`);
      const data = await response.json();
      if (!data.access_token || !Number.isFinite(data.expires_in)) throw new Error('Invalid ACC authorization response');
      token = data.access_token; tokenExpiry = Date.now() + Math.max(0, data.expires_in - 60) * 1000;
      return token;
    })();
    try { return await tokenPending; } finally { tokenPending = null; }
  }
  async function request(path) {
    const url = new URL(path, API);
    if (url.origin !== API || url.username || url.password) throw new Error('Invalid ACC API destination');
    for (let attempt = 0; attempt < 3; attempt++) {
      const response = await transport(url.href, { redirect: 'error', signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${await accessToken()}` } });
      if (response.status === 401 && attempt === 0) { token = null; continue; }
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        const delay = Math.min(10, Math.max(1, Number(response.headers.get('retry-after')) || 2 ** attempt));
        await new Promise(resolve => setTimeout(resolve, delay * 1000)); continue;
      }
      if (!response.ok) throw new Error(`ACC request failed (${response.status})`);
      return response.json();
    }
  }
  async function scan() {
    const root = (await request(`${prefix}/folders/${segment(rootId)}`)).data;
    if (!root || deleted(root)) throw new Error('ACC root folder is unavailable');
    const queue = [{ id: rootId, path: nameOf(root) || 'Issuances', depth: 0 }];
    const visited = new Set(), items = new Map();
    while (queue.length) {
      const folder = queue.shift();
      if (visited.has(folder.id)) continue;
      if (visited.size >= 1000 || folder.depth > 40) throw new Error('ACC folder traversal limit reached');
      visited.add(folder.id);
      const endpoint = `${prefix}/folders/${segment(folder.id)}/contents`;
      let next = `${endpoint}?page%5Blimit%5D=200`; const pages = new Set();
      while (next) {
        const url = new URL(next, API);
        if (url.origin !== API || decodeURIComponent(url.pathname) !== decodeURIComponent(endpoint) || pages.has(url.href) || pages.size >= 100) throw new Error('Invalid ACC pagination');
        pages.add(url.href);
        const result = await request(url.href);
        for (const entry of result.data || []) {
          if (!entry.id || deleted(entry)) continue;
          if (entry.type === 'folders') { queue.push({ id: entry.id, path: `${folder.path} / ${nameOf(entry)}`, depth: folder.depth + 1 }); continue; }
          if (entry.type !== 'items' || !pdf(nameOf(entry))) continue;
          const versionId = entry.relationships?.tip?.data?.id;
          if (!versionId) continue;
          const version = result.included?.find(v => v.type === 'versions' && v.id === versionId) || (await request(`${prefix}/versions/${segment(versionId)}`)).data;
          if (!version || deleted(version) || !pdf(nameOf(version) || nameOf(entry))) continue;
          items.set(entry.id, { id: entry.id, versionId, name: nameOf(entry), folder: folder.path,
            updated: version.attributes?.lastModifiedTime || version.attributes?.createTime || entry.attributes?.lastModifiedTime || null,
            version: version.attributes?.versionNumber || null, source: 'acc',
            url: `/api/acc/pdf?id=${segment(entry.id)}` });
          if (items.size > 10000) throw new Error('ACC PDF limit reached');
        }
        next = typeof result.links?.next === 'string' ? result.links.next : result.links?.next?.href;
      }
    }
    return [...items.values()].sort((a, b) => a.folder.localeCompare(b.folder, undefined, { numeric: true }) || a.name.localeCompare(b.name, undefined, { numeric: true }));
  }
  async function list(force = false) {
    if (!enabled || !configured()) throw new Error('ACC connection is not configured');
    if (!force && cache && Date.now() - cacheTime < TTL) return cache;
    if (pending) return pending;
    pending = scan();
    try { cache = await pending; cacheTime = Date.now(); return cache; }
    catch (error) { cache = null; cacheTime = 0; throw error; }
    finally { pending = null; }
  }
  async function download(itemId) {
    // Re-scan on download: moved/deleted files must lose access immediately.
    const item = (await list(true)).find(item => item.id === itemId);
    if (!item) { const error = new Error('PDF not found in the configured folder tree'); error.status = 404; throw error; }
    const version = (await request(`${prefix}/versions/${segment(item.versionId)}`)).data;
    if (!version || deleted(version) || !pdf(nameOf(version))) throw new Error('PDF is no longer available');
    const storage = version.relationships?.storage?.data?.id || '';
    const match = /^urn:adsk\.objects:os\.object:([^/]+)\/(.+)$/.exec(storage);
    if (!match) throw new Error('PDF storage is unavailable');
    const signed = await request(`/oss/v2/buckets/${segment(match[1])}/objects/${segment(match[2])}/signeds3download?minutesExpiration=1`);
    if (signed.status !== 'complete') throw new Error('PDF is still processing');
    const target = new URL(signed.url);
    if (target.protocol !== 'https:' || target.username || target.password || !(target.hostname.endsWith('.amazonaws.com') || target.hostname.endsWith('.amazonaws.com.cn'))) throw new Error('Invalid PDF download destination');
    return target.href;
  }
  return { enabled, configured, list, download };
}

// Kept separate to test that every ACC download passes the existing portal gate.
export async function handleAccDownload(req, res, source, authenticated) {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname !== '/api/acc/pdf') return false;
  const fail = (status, error) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ error })); };
  if (req.method !== 'GET') { fail(405, 'Method not allowed'); return true; }
  if (!authenticated(req)) { fail(401, 'Sign in to download project PDFs'); return true; }
  try {
    const target = await source.download(url.searchParams.get('id'));
    res.writeHead(302, { Location: target, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' }); res.end();
  } catch (error) { fail(error.status === 404 ? 404 : 503, error.status === 404 ? 'PDF not found' : 'PDF is temporarily unavailable'); }
  return true;
}
