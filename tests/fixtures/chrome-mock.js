/**
 * chrome-mock.js — Minimal chrome.* API stub for content script testing.
 * Must load BEFORE prompts.js and content.js.
 *
 * Tests can pre-seed storage by calling chrome.storage.local._seed({...})
 * before navigating, or via page.evaluate() at runtime.
 */
window.chrome = {
  runtime: {
    getManifest() {
      return { version: '0.2.0' };
    },
  },

  storage: {
    local: {
      _data: Object.assign({}, window.__SEED_STORAGE__),

      _seed(obj) {
        Object.assign(this._data, obj);
      },

      _reset() {
        this._data = {};
      },

      async get(keys) {
        // Mimic Chrome's behaviour: if keys is a string, wrap
        if (typeof keys === 'string') {
          const val = this._data[keys];
          return { [keys]: val !== undefined ? val : undefined };
        }
        if (Array.isArray(keys)) {
          const out = {};
          for (const k of keys) {
            if (k in this._data) out[k] = this._data[k];
          }
          return out;
        }
        // null / undefined → return everything
        return { ...this._data };
      },

      async set(items) {
        Object.assign(this._data, items);
      },

      async remove(key) {
        delete this._data[key];
      },

      async clear() {
        this._data = {};
      },
    },
  },
};
