import {
  DuckDuckGoSearchProvider,
  SearchProviderError,
  formatSearchResponse,
  setSearchProvider,
} from '../SearchProvider';

class MockSearchProvider {
  readonly id = 'mock';

  async search(query: string, maxResults: number) {
    if (query === 'empty') {
      throw new SearchProviderError('empty', 'No results');
    }
    return {
      query,
      results: Array.from({ length: maxResults }, (_, index) => ({
        title: `Hit ${index + 1}`,
        snippet: `Snippet ${index + 1}`,
        url: `https://example.com/${index + 1}`,
      })),
    };
  }
}

describe('SearchProvider', () => {
  afterEach(() => {
    setSearchProvider(new DuckDuckGoSearchProvider());
  });

  it('formats normalized search payloads', async () => {
    setSearchProvider(new MockSearchProvider() as any);
    const provider = new MockSearchProvider();
    const response = await provider.search('expo sdk', 2);
    const formatted = formatSearchResponse(response);
    const parsed = JSON.parse(formatted);
    expect(parsed.count).toBe(2);
    expect(parsed.results[0].url).toContain('https://');
  });

  it('rejects invalid queries', async () => {
    const provider = new DuckDuckGoSearchProvider();
    await expect(provider.search('   ', 3)).rejects.toMatchObject({ code: 'invalid_query' });
  });

  it('surfaces empty-result errors', async () => {
    setSearchProvider(new MockSearchProvider() as any);
    const provider = new MockSearchProvider();
    await expect(provider.search('empty', 3)).rejects.toMatchObject({ code: 'empty' });
  });
});
