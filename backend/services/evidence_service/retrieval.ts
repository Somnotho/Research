import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';
import { load } from 'cheerio';
import { createHash } from 'node:crypto';

export async function validate_source_url(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443'))
    throw new Error('Use a public HTTPS URL without credentials or custom ports.');
  if (url.hostname.endsWith('.local') || !url.hostname.includes('.'))
    throw new Error('Private/local destinations are not allowed');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (ipaddr.isValid(hostname) && ipaddr.process(hostname).range() !== 'unicast')
    throw new Error('Private, reserved or local network destinations are not allowed');
  let addresses;
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    // Cloud egress proxies resolve approved destinations themselves; local DNS may be unavailable.
    // This fallback is limited to explicitly approved public names, never arbitrary URLs or IPs.
    const approved_hosts = new Set([
      'en.wikipedia.org',
      ...(process.env.RESEARCH_SOURCE_DOMAINS ?? '').split(',').map((host) => host.trim().toLowerCase()),
    ]);
    const proxy_present = process.env.HTTPS_PROXY || process.env.https_proxy;
    if (proxy_present && !ipaddr.isValid(hostname) && approved_hosts.has(hostname)) return url;
    throw new Error(
      'Public DNS is unavailable locally. For proxy-backed retrieval, approve this public hostname in RESEARCH_SOURCE_DOMAINS and environment network settings.',
    );
  }
  if (!addresses.length || addresses.some((address) => ipaddr.process(address.address).range() !== 'unicast'))
    throw new Error('Private, reserved or local network destinations are not allowed');
  return url;
}

export async function download_source(value: string) {
  let url = await validate_source_url(value);
  for (let redirect = 0; redirect <= 4; redirect++) {
    const response = await fetch(url, {
      redirect: 'manual',
      headers: { 'User-Agent': 'ResearchOffice/1.0 (private user-directed research)' },
      signal: AbortSignal.timeout(20000),
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      await response.body?.cancel();
      if (!location) throw new Error('Source redirect has no destination');
      url = await validate_source_url(new URL(location, url).toString());
      continue;
    }
    if (!response.ok) throw new Error(`Source returned HTTP ${response.status}`);
    if (Number(response.headers.get('content-length') ?? 0) > 10 * 1024 * 1024)
      throw new Error('Source exceeds 10 MB');
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (!response.body) throw new Error('Source has no content');
    const reader = response.body.getReader();
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      const chunk = next.value;
      size += chunk.length;
      if (size > 10 * 1024 * 1024) {
        await reader.cancel();
        throw new Error('Source exceeds 10 MB');
      }
      chunks.push(chunk);
    }
    const contents = Buffer.concat(chunks);
    const mime_type = response.headers.get('content-type')?.split(';')[0] ?? '';
    let text = '';
    let title = url.hostname;
    if (mime_type.includes('html')) {
      const page = load(contents.toString('utf8'));
      title = page('title').text().trim().slice(0, 200) || title;
      page('script,style,nav,footer,header,iframe,form,noscript').remove();
      text = (page('article').text() || page('main').text() || page('body').text())
        .replace(/\s+/g, ' ')
        .trim();
    } else if (mime_type.startsWith('text/') || mime_type.includes('json')) text = contents.toString('utf8');
    else if (!mime_type.includes('pdf')) throw new Error('Source must be HTML, text, JSON or PDF');
    return {
      url: url.toString(),
      title,
      mime_type,
      contents,
      text: text.slice(0, 500000),
      content_hash: createHash('sha256').update(contents).digest('hex'),
    };
  }
  throw new Error('Too many redirects');
}
