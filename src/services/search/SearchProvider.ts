export type SearchResult = {
  title: string;
  snippet: string;
  url: string;
};

export type SearchResponse = {
  query: string;
  results: SearchResult[];
};

export type SearchErrorCode = 'invalid_query' | 'network' | 'timeout' | 'empty' | 'provider_error';

export class SearchProviderError extends Error {
  readonly code: SearchErrorCode;

  constructor(code: SearchErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export interface SearchProvider {
  readonly id: string;
  search(query: string, maxResults: number, signal?: AbortSignal): Promise<SearchResponse>;
}

const cleanText = (value: unknown): string =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

const decodeHtml = (value: string): string =>
  value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

const dedupeResults = (hits: SearchResult[]): SearchResult[] => {
  const seen = new Set<string>();
  const out: SearchResult[] = [];
  for (const hit of hits) {
    const key = `${hit.title}|${hit.url}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(hit);
  }
  return out;
};

const withTimeout = async <T>(promise: Promise<T>, ms: number, signal?: AbortSignal): Promise<T> => {
  if (signal?.aborted) {
    throw new SearchProviderError('timeout', 'Search cancelled.');
  }
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new SearchProviderError('timeout', 'Search timed out.')), ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new SearchProviderError('timeout', 'Search cancelled.'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    promise
      .then(value => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        resolve(value);
      })
      .catch(error => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        reject(error);
      });
  });
};

export class DuckDuckGoSearchProvider implements SearchProvider {
  readonly id = 'duckduckgo';

  private async searchInstant(query: string): Promise<SearchResult[]> {
    const url =
      'https://api.duckduckgo.com/?q=' +
      encodeURIComponent(query) +
      '&format=json&no_redirect=1&no_html=1';
    const res = await fetch(url);
    if (!res.ok) {
      throw new SearchProviderError('network', `search_api_${res.status}`);
    }
    const data = await res.json();
    const hits: SearchResult[] = [];
    if (data.AbstractText) {
      hits.push({
        title: cleanText(data.Heading || 'Summary'),
        snippet: cleanText(data.AbstractText),
        url: cleanText(data.AbstractURL || ''),
      });
    }
    const topics = Array.isArray(data.RelatedTopics) ? data.RelatedTopics : [];
    for (const topic of topics) {
      if (hits.length >= 8) break;
      if (topic?.Text) {
        hits.push({
          title: cleanText(String(topic.Text).split(' - ')[0] || topic.Text),
          snippet: cleanText(topic.Text),
          url: cleanText(topic.FirstURL || ''),
        });
        continue;
      }
      if (Array.isArray(topic?.Topics)) {
        for (const sub of topic.Topics) {
          if (hits.length >= 8) break;
          if (!sub?.Text) continue;
          hits.push({
            title: cleanText(String(sub.Text).split(' - ')[0] || sub.Text),
            snippet: cleanText(sub.Text),
            url: cleanText(sub.FirstURL || ''),
          });
        }
      }
    }
    return hits;
  }

  private async searchHtml(query: string, maxResults: number): Promise<SearchResult[]> {
    const res = await fetch('https://html.duckduckgo.com/html/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `q=${encodeURIComponent(query)}`,
    });
    if (!res.ok) {
      throw new SearchProviderError('network', `search_html_${res.status}`);
    }
    const html = await res.text();
    const hits: SearchResult[] = [];
    const resultRe =
      /class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|td|div)/gi;
    let match: RegExpExecArray | null;
    while ((match = resultRe.exec(html)) && hits.length < maxResults) {
      const url = cleanText(decodeHtml(match[1] || ''));
      const title = cleanText(decodeHtml(match[2] || '').replace(/<[^>]+>/g, ''));
      const snippet = cleanText(decodeHtml(match[3] || '').replace(/<[^>]+>/g, ''));
      if (!title && !snippet) continue;
      hits.push({ title: title || snippet.slice(0, 80), snippet, url });
    }
    return hits;
  }

  async search(query: string, maxResults: number, signal?: AbortSignal): Promise<SearchResponse> {
    const q = cleanText(query);
    if (!q) {
      throw new SearchProviderError('invalid_query', 'No search query provided.');
    }
    const limit = Math.min(Math.max(Math.floor(maxResults), 1), 10);
    return withTimeout(this.runSearch(q, limit), 15000, signal);
  }

  private async runSearch(query: string, maxResults: number): Promise<SearchResponse> {
    let hits: SearchResult[] = [];
    try {
      hits = await this.searchInstant(query);
    } catch {
      console.log('search_instant_fail');
    }
    if (hits.length < 2) {
      try {
        hits = dedupeResults([...hits, ...(await this.searchHtml(query, maxResults))]);
      } catch {
        console.log('search_html_fail');
      }
    }
    hits = dedupeResults(hits).slice(0, maxResults);
    if (hits.length === 0) {
      throw new SearchProviderError('empty', `No web results found for '${query}'.`);
    }
    return { query, results: hits };
  }
}

let activeProvider: SearchProvider = new DuckDuckGoSearchProvider();

export const getSearchProvider = (): SearchProvider => activeProvider;

export const setSearchProvider = (provider: SearchProvider): void => {
  activeProvider = provider;
};

export const formatSearchResponse = (response: SearchResponse): string => {
  const lines = response.results.map((hit, index) => {
    const parts = [`${index + 1}. ${hit.title}`];
    if (hit.snippet) parts.push(hit.snippet);
    if (hit.url) parts.push(hit.url);
    return parts.join('\n');
  });
  return JSON.stringify({
    query: response.query,
    count: response.results.length,
    results: response.results,
    result: lines.join('\n\n'),
  });
};
