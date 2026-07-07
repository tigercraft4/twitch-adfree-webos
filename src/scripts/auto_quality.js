/**
 * auto_quality.js
 * Shows a notification when a stream loads.
 * 
 * Note: Forcing a specific default quality on Twitch TV (lg.tv.twitch.tv)
 * is not possible without access to the internal player API — the app
 * always defaults to "Auto" (ABR) regardless of localStorage or m3u8 order.
 * All quality options remain available via the player settings menu.
 */

import { showNotification } from './ui.js';

(function watchStream() {
  let lastSrc = null;

  const observer = new MutationObserver(() => {
    const video = document.querySelector('video');
    if (!video || !video.src || video.src === lastSrc) return;

    lastSrc = video.src;

    setTimeout(() => {
      showNotification('▶ Stream a carregar — seleciona qualidade nas ⚙️ definições', 4000, 'info');
    }, 3000);
  });

  observer.observe(document.body, { childList: true, subtree: true });
})();
