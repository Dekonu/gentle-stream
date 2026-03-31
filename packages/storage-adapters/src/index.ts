export * from "./types";
export * from "./web-local-storage";

import type { StorageAdapter } from "./types";

export const memoryStorageAdapter: StorageAdapter = {
  _store: new Map<string, string>(),
  get() {
    return this._store.get(arguments[0]) ?? null;
  },
  set() {
    const key = arguments[0] as string;
    const value = arguments[1] as string;
    this._store.set(key, value);
  },
  remove() {
    this._store.delete(arguments[0] as string);
  },
};
