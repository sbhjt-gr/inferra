type ThinkChunk =
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'text'; text: string };

type TagPair = { open: string; close: string };

const TAG_PAIRS: TagPair[] = [
  { open: '<think>', close: '</think>' },
  { open: '<|channel>thought', close: '<channel|>' },
];

const LONGEST_TAG = Math.max(
  ...TAG_PAIRS.flatMap((p) => [p.open.length, p.close.length]),
);

export class ThinkTagParser {
  private buf = '';

  feed(token: string): ThinkChunk[] {
    this.buf += token;
    const chunks: ThinkChunk[] = [];

    while (this.buf.length > 0) {
      let bestIdx = -1;
      let bestPair: TagPair | null = null;
      let bestIsOpen = false;

      for (const pair of TAG_PAIRS) {
        const openIdx = this.buf.indexOf(pair.open);
        const closeIdx = this.buf.indexOf(pair.close);

        if (openIdx !== -1 && (bestIdx === -1 || openIdx < bestIdx)) {
          bestIdx = openIdx;
          bestPair = pair;
          bestIsOpen = true;
        }
        if (closeIdx !== -1 && (bestIdx === -1 || closeIdx < bestIdx)) {
          bestIdx = closeIdx;
          bestPair = pair;
          bestIsOpen = false;
        }
      }

      if (bestIdx === -1 || !bestPair) {
        if (this.couldBePartialTag(this.buf)) {
          break;
        }
        chunks.push({ type: 'text', text: this.buf });
        this.buf = '';
        break;
      }

      if (bestIdx > 0) {
        chunks.push({ type: 'text', text: this.buf.slice(0, bestIdx) });
      }

      const tag = bestIsOpen ? bestPair.open : bestPair.close;
      chunks.push({ type: bestIsOpen ? 'open' : 'close' });
      this.buf = this.buf.slice(bestIdx + tag.length);
      console.log(bestIsOpen ? 'think_open' : 'think_close', tag);
    }

    return chunks;
  }

  flush(): ThinkChunk[] {
    if (this.buf.length === 0) return [];
    const text = this.buf;
    this.buf = '';
    return [{ type: 'text', text }];
  }

  private couldBePartialTag(s: string): boolean {
    const tail = s.slice(Math.max(0, s.length - LONGEST_TAG + 1));
    for (let i = 1; i <= tail.length; i++) {
      const suffix = tail.slice(tail.length - i);
      for (const pair of TAG_PAIRS) {
        if (pair.open.startsWith(suffix) || pair.close.startsWith(suffix)) {
          return true;
        }
      }
    }
    return false;
  }
}
