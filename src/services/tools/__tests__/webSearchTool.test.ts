import { executeWebSearch } from '../WebSearchTool';
import { setSearchProvider, SearchProviderError } from '../../search/SearchProvider';

const mockSearch = jest.fn();

beforeEach(() => {
  mockSearch.mockReset();
  setSearchProvider({
    id: 'mock',
    search: mockSearch,
  });
});

describe('web_search tool', () => {
  it('invokes search provider with integer maxResults', async () => {
    mockSearch.mockResolvedValue({
      query: 'expo sdk',
      results: [{ title: 'Expo', snippet: 'SDK', url: 'https://expo.dev' }],
    });

    const raw = await executeWebSearch({ query: 'expo sdk', maxResults: 4 });
    const parsed = JSON.parse(raw);
    expect(mockSearch).toHaveBeenCalledWith('expo sdk', 4);
    expect(parsed.count).toBe(1);
  });

  it('returns structured invalid query errors', async () => {
    const raw = await executeWebSearch({ query: '   ' });
    const parsed = JSON.parse(raw);
    expect(parsed.code).toBe('invalid_query');
  });

  it('returns provider errors without pretending success', async () => {
    mockSearch.mockRejectedValue(new SearchProviderError('timeout', 'Search timed out.'));
    const raw = await executeWebSearch({ query: 'news' });
    const parsed = JSON.parse(raw);
    expect(parsed.code).toBe('timeout');
    expect(parsed.error).toContain('timed out');
  });
});
