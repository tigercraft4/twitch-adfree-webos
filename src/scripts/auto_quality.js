/**
 * auto_quality.js
 * Forces maximum quality via three methods:
 * 1. localStorage proxy — intercepts reads/writes before player init
 * 2. Worker postMessage hook — catches quality messages between player and worker
 * 3. Notification when stream starts
 */

import { showNotification } from './ui.js';

const QUALITY_KEY = 'video-quality';
const MAX_QUALITY_VALUE = JSON.stringify({ default: 'chunked' });

// ─── Method 1: localStorage proxy ────────────────────────────────────────────
// The Twitch player reads video-quality from localStorage on init.
// We intercept ALL reads to always return 'chunked' (Source).
(function proxyLocalStorage() {
  const _getItem = Storage.prototype.getItem;
  const _setItem = Storage.prototype.setItem;

  Storage.prototype.getItem = function (key) {
    if (key === QUALITY_KEY) {
      return MAX_QUALITY_VALUE;
    }
    return _getItem.call(this, key);
  };

  Storage.prototype.setItem = function (key, value) {
    if (key === QUALITY_KEY) {
      // Block player from persisting any lower quality
      return _setItem.call(this, key, MAX_QUALITY_VALUE);
    }
    return _setItem.call(this, key, value);
  };

  // Pre-seed the value
  try { _setItem.call(localStorage, QUALITY_KEY, MAX_QUALITY_VALUE); } catch (_) {}

  console.log('[TAF] Auto-quality: localStorage proxy active');
})();

// ─── Method 2: Worker postMessage hook ───────────────────────────────────────
// The Twitch player communicates quality via postMessage to its worker.
// We intercept outgoing messages and force quality to 'chunked'.
(function hookWorkerMessages() {
  const _Worker = window.Worker;

  window.Worker = class extends _Worker {
    constructor(...args) {
      super(...args);

      const _postMessage = this.postMessage.bind(this);

      this.postMessage = function (msg, ...rest) {
        // Twitch sends quality as { type: 'setQuality', data: { quality: '...' } }
        // or similar structures — force to chunked
        if (msg && typeof msg === 'object') {
          if (msg.type === 'setQuality' || msg.type === 'SET_QUALITY') {
            msg = { ...msg, data: { ...(msg.data || {}), quality: 'chunked' } };
          }
          // Also check for encoded quality in the payload
          if (msg.quality && msg.quality !== 'chunked') {
            msg = { ...msg, quality: 'chunked' };
          }
        }
        return _postMessage(msg, ...rest);
      };
    }
  };

  console.log('[TAF] Auto-quality: Worker postMessage hook active');
})();

// ─── Method 3: Stream notification ───────────────────────────────────────────
// Show a notification whenever a new stream loads.
(function watchStream() {
  let lastSrc = null;
  let notified = false;

  const observer = new MutationObserver(() => {
    const video = document.querySelector('video');
    if (!video) return;

    if (video.src && video.src !== lastSrc) {
      lastSrc = video.src;
      notified = false;

      setTimeout(() => {
        if (!notified) {
          showNotification('🎬 Qualidade: Source (Máxima)', 3000, 'info');
          notified = true;
        }
      }, 3500);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  console.log('[TAF] Auto-quality: stream watcher active');
})();
