import { z } from 'zod';

export async function search_evidence(question: string) {
  if (process.env.RESEARCH_MODEL_MODE === 'simulation')
    return { sources: [], method: 'Simulation: no external search performed.' };
  const query = question.slice(0, 400);
  if (process.env.RESEARCH_SEARCH_KEY) {
    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', '6');
    const response = await fetch(url, {
      headers: { 'X-Subscription-Token': process.env.RESEARCH_SEARCH_KEY },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Search provider returned HTTP ${response.status}`);
    const data = z
      .object({
        web: z
          .object({
            results: z.array(
              z.object({ title: z.string(), url: z.url(), description: z.string().optional() }),
            ),
          })
          .optional(),
      })
      .parse(await response.json());
    return {
      sources: (data.web?.results ?? []).map((result) => ({
        title: result.title,
        url: result.url,
        excerpt: result.description ?? '',
      })),
      method: 'Brave search snippets; full source text has not been verified.',
    };
  }
  const url = new URL('https://en.wikipedia.org/w/api.php');
  url.search = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: query,
    srlimit: '5',
    format: 'json',
  }).toString();
  const response = await fetch(url, {
    headers: { 'User-Agent': 'ResearchOffice/0.1 (private research prototype)' },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Wikipedia returned HTTP ${response.status}`);
  const data = z
    .object({
      query: z.object({
        search: z.array(z.object({ title: z.string(), pageid: z.number(), snippet: z.string() })),
      }),
    })
    .parse(await response.json());
  return {
    sources: data.query.search.map((result) => ({
      title: result.title,
      url: `https://en.wikipedia.org/?curid=${result.pageid}`,
      excerpt: result.snippet.replace(/<[^>]*>/g, ''),
    })),
    method:
      'Wikipedia search snippets only. Not a general market search or full article verification. Configure Brave for broader discovery.',
  };
}
