/**
 * Simple in-memory implementation of a least recently used cache. Based on
 * Map's preservation of insertion order.
 */
export class Cache<K, V> {
  private values: Map<K, V> = new Map<K, V>();
  private shouldCacheMore: (currentNumItems: number) => boolean;

  constructor(shouldCacheMore: (currentNumItems: number) => boolean) {
    this.shouldCacheMore = shouldCacheMore;
  }

  get(key: K) {
    const value = this.values.get(key);
    if (!this.values.has(key)) {
      return undefined;
    }

    // Re-insert the value to record that it has been recently used.
    this.values.delete(key);
    this.values.set(key, value!);

    return value;
  }

  set(key: K, value: V) {
    // Remove least used item if cache is full.
    if (!this.shouldCacheMore(this.values.size)) {
      const [keyToRemove] = this.values.entries().next().value;
      this.values.delete(keyToRemove);
    }

    this.values.set(key, value);
  }
}
