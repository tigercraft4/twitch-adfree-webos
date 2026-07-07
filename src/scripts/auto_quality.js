/**
 * auto_quality.js
 * Forces max quality by intercepting the HLS master playlist XHR,
 * fetching it separately, rewriting it, and substituting via a Blob URL.
 */

import { showNotification } from './ui.js';

(function interceptHLSQuality() {
  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...args) {
    this.__tafUrl = typeof url === 'string' ? url : '';
    this.__tafMethod = method;
    return _open.call(this, method, url, ...args);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    const url = this.__tafUrl || '';

    if (url.includes('usher.ttvnw.net/api/channel/hls/')) {
      const origXhr = this;

      // Abort the original request — we'll handle it ourselves
      const proxyXhr = new XMLHttpRequest();
      proxyXhr.__tafUrl = ''; // prevent recursive interception

      // Re-open with same URL but mark as proxy
      _open.call(proxyXhr, this.__tafMethod || 'GET', url, true);

      // Copy headers if any were set
      try {
        const origHeaders = origXhr.__tafHeaders || {};
        Object.entries(origHeaders).forEach(([k, v]) => proxyXhr.setRequestHeader(k, v));
      } catch (_) {}

      proxyXhr.onload = function () {
        if (proxyXhr.status === 200) {
          try {
            const rewritten = keepOnlyMaxQuality(proxyXhr.responseText);
            const blob = new Blob([rewritten || proxyXhr.responseText], { type: 'application/vnd.apple.mpegurl' });
            const blobUrl = URL.createObjectURL(blob);

            // Now redirect the original XHR to the blob
            _open.call(origXhr, 'GET', blobUrl, true);
            _send.call(origXhr);

            if (rewritten && rewritten !== proxyXhr.responseText) {
              console.log('[TAF] Auto-quality: m3u8 rewritten to max quality');
              if (!window.__tafQualityNotified) {
                window.__tafQualityNotified = true;
                showNotification('🎬 Qualidade: Source (Máxima)', 3000, 'info');
                setTimeout(() => { window.__tafQualityNotified = false; }, 15000);
              }
            } else {
              // Rewrite failed or not a master playlist — use original response
              _open.call(origXhr, 'GET', url, true);
              _send.call(origXhr);
            }
          } catch (e) {
            console.warn('[TAF] Auto-quality rewrite error:', e);
            // Fallback: load original URL normally
            _open.call(origXhr, 'GET', url, true);
            _send.call(origXhr);
          }
        } else {
          // Non-200 — pass through normally
          _open.call(origXhr, 'GET', url, true);
          _send.call(origXhr);
        }
      };

      proxyXhr.onerror = function () {
        // Network error — fall through to original
        _open.call(origXhr, 'GET', url, true);
        _send.call(origXhr);
      };

      proxyXhr.send();
      return; // Don't call original _send — we handle it above
    }

    return _send.call(this, ...args);
  };

  // Track setRequestHeader calls so we can replay them on the proxy XHR
  const _setHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
    if (!this.__tafHeaders) this.__tafHeaders = {};
    this.__tafHeaders[k] = v;
    return _setHeader.call(this, k, v);
  };

  console.log('[TAF] Auto-quality: XHR interceptor active');
})();

/**
 * Parse HLS master playlist and keep only the highest bandwidth stream.
 */
function keepOnlyMaxQuality(m3u8) {
  if (!m3u8 || !m3u8.includes('#EXTM3U')) return null;

  const lines = m3u8.split('\n');
  const streams = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXT-X-STREAM-INF')) {
      const bwMatch = line.match(/BANDWIDTH=(\d+)/);
      const bandwidth = bwMatch ? parseInt(bwMatch[1], 10) : 0;
      const uri = (lines[i + 1] || '').trim();
      if (uri && !uri.startsWith('#')) {
        streams.push({ header: line, uri, bandwidth });
        i++;
      }
    }
  }

  if (streams.length <= 1) return null; // Nothing to rewrite

  streams.sort((a, b) => b.bandwidth - a.bandwidth);
  const best = streams[0];

  // Keep header lines + EXT-X-MEDIA + only best stream
  const output = [];
  for (const line of lines) {
    const t = line.trim();
    if (
      t.startsWith('#EXTM3U') ||
      t.startsWith('#EXT-X-TWITCH') ||
      t.startsWith('#EXT-X-MEDIA')
    ) {
      output.push(line);
    }
  }
  output.push(best.header);
  output.push(best.uri);

  return output.join('\n') + '\n';
}
