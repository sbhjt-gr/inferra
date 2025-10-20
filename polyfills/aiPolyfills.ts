import '@azure/core-asynciterator-polyfill';
import structuredClone from '@ungap/structured-clone';

if (typeof globalThis.structuredClone !== 'function') {
  (globalThis as any).structuredClone = structuredClone;
}
