/**
 * auto_quality.js
 * Forces max quality by intercepting the HLS playlist XHR request
 * on the main thread and rewriting the m3u8 to keep only the highest quality.
 * 
 * The Twitch TV app uses XMLHttpRequest (not fetch) on the main thread
 * to request quality playlists from usher.ttvnw.net.
 */

import { showNotification } from './ui.js';

(function interceptHLSQuality() {
  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...args) {
    this.__tafUrl = url;
    return _open.call(this, method, url, ...args);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    const url = this.__tafUrl || '';

    // Only intercept the master HLS playlist from usher (quality selection)
    if (url && url.includes('usher.ttvnw.net/api/channel/hls/')) {
      const xhr = this;
      const originalOnReadyStateChange = xhr.onreadystatechange;

      Object.defineProperty(xhr, 'onreadystatechange', {
        set(fn) { originalOnReadyStateChange = fn; },
        get() { return originalOnReadyStateChange; }
      });

      xhr.addEventListener('readystatechange', function () {
        if (xhr.readyState === 4 && xhr.status === 200) {
          try {
            const m3u8 = xhr.responseText;
            const rewritten = keepOnlyMaxQuality(m3u8);

            if (rewritten && rewritten !== m3u8) {
              // Override responseText with rewritten m3u8
              Object.defineProperty(xhr, 'responseText', { value: rewritten, writable: false });
              Object.defineProperty(xhr, 'response', { value: rewritten, writable: false });
              console.log('[TAF] Auto-quality: rewrote m3u8 to max quality');

              // Show notification once
              if (!window.__tafQualityNotified) {
                window.__tafQualityNotified = true;
                showNotification('🎬 Qualidade: Source (Máxima)', 3000, 'info');
                // Reset flag on next stream
                setTimeout(() => { window.__tafQualityNotified = false; }, 10000);
              }
            }
          } catch (e) {
            console.warn('[TAF] Auto-quality: m3u8 rewrite failed:', e);
          }
        }
      });
    }

    return _send.call(this, ...args);
  };

  console.log('[TAF] Auto-quality: XHR HLS interceptor active');
})();

/**
 * Parse an HLS master playlist and return only the highest bandwidth stream.
 * @param {string} m3u8 - Original m3u8 content
 * @returns {string} - Rewritten m3u8 with only the top quality
 */
function keepOnlyMaxQuality(m3u8) {
  const lines = m3u8.split('\n');
  const streams = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i].trim();
    if (line.startsWith('#EXT-X-STREAM-INF')) {
      const bandwidthMatch = line.match(/BANDWIDTH=(\d+)/);
      const bandwidth = bandwidthMatch ? parseInt(bandwidthMatch[1], 10) : 0;
      const uri = lines[i + 1]?.trim();
      if (uri && !uri.startsWith('#')) {
        streams.push({ header: line, uri, bandwidth });
        i += 2;
        continue;
      }
    }
    i++;
  }

  if (streams.length === 0) return m3u8; // Not a master playlist

  // Sort by bandwidth descending, take the highest
  streams.sort((a, b) => b.bandwidth - a.bandwidth);
  const best = streams[0];

  // Rebuild: keep all non-stream lines + only the best stream
  const header = lines.filter(l => {
    const t = l.trim();
    return t.startsWith('#EXTM3U') ||
      t.startsWith('#EXT-X-TWITCH') ||
      t.startsWith('#EXT-X-MEDIA') ||
      (t.startsWith('#EXT-X-STREAM-INF') && t === best.header);
  });

  return [...header, best.header, best.uri].join('\n') + '\n';
}
