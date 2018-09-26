/**
 * Simple in-memory implementation of a least recently used cache. Based on
 * Map's preservation of insertion order.
 */
export class Cache<T> {
  private values: Map<string, T> = new Map<string, T>();
  private maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  get(key: string) {
    const value = this.values.get(key);
    if (!value) {
      return null;
    }

    // Re-insert value.
    this.values.delete(key);
    this.values.set(key, value);

    return value;
  }

  set(key: string, value: T) {
    // Remove least used item if cache is full.
    if (this.values.size > this.maxSize) {
      const [keyToRemove] = this.values.entries().next().value;
      this.values.delete(keyToRemove);
    }

    this.values.set(key, value);
  }
}
