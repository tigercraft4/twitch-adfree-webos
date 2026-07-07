/**
 * auto_quality.js
 * Forces maximum quality using the Twitch internal player API,
 * the same way the YouTube app does it — no DOM clicking required.
 */

import { showNotification } from './ui.js';

/**
 * Get the Twitch internal player object via React fiber.
 * Twitch renders its player as a React component — the internal API
 * is accessible via the React fiber props on the video wrapper element.
 */
function getTwitchPlayer() {
  // Look for the video element and walk up the React fiber tree
  const videoEl = document.querySelector('video');
  if (!videoEl) return null;

  // Find the React fiber root key (React attaches it as __reactFiber$ or __reactInternalInstance$)
  const fiberKey = Object.keys(videoEl).find(
    (k) => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')
  );
  if (!fiberKey) return null;

  let fiber = videoEl[fiberKey];

  // Walk up the fiber tree looking for a node with player API methods
  let limit = 100;
  while (fiber && limit-- > 0) {
    const player =
      fiber?.memoizedProps?.player ||
      fiber?.memoizedState?.player ||
      fiber?.pendingProps?.player;

    if (player && typeof player.setQuality === 'function') {
      return player;
    }

    // Also try stateNode for class components
    const statePlayer = fiber?.stateNode?.player;
    if (statePlayer && typeof statePlayer.setQuality === 'function') {
      return statePlayer;
    }

    fiber = fiber.return;
  }

  return null;
}

/**
 * Get the Twitch player via the global mediaplayer registry (alternative path).
 * Twitch exposes this on some versions via window.Twitch or internal modules.
 */
function getTwitchPlayerFallback() {
  // Try the internal player registry that Twitch uses
  const playerEl = document.querySelector('[data-a-target="player-overlay-click-handler"]');
  if (!playerEl) return null;

  const fiberKey = Object.keys(playerEl).find(
    (k) => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance')
  );
  if (!fiberKey) return null;

  let fiber = playerEl[fiberKey];
  let limit = 200;

  while (fiber && limit-- > 0) {
    const props = fiber?.memoizedProps;
    if (props?.mediaPlayerInstance && typeof props.mediaPlayerInstance.setQuality === 'function') {
      return props.mediaPlayerInstance;
    }
    if (props?.player && typeof props.player.setQuality === 'function') {
      return props.player;
    }
    fiber = fiber.return;
  }

  return null;
}

/**
 * Apply max quality using the internal player API.
 */
async function applyMaxQuality() {
  const player = getTwitchPlayer() || getTwitchPlayerFallback();

  if (player) {
    try {
      // Get available qualities — returns array sorted highest first
      const qualities = player.getQualities?.() || [];
      const maxQuality = qualities[0];

      if (maxQuality) {
        player.setQuality(maxQuality.group || maxQuality.name || maxQuality.id);
        const label = maxQuality.name || maxQuality.group || 'Máxima';
        showNotification(`🎬 Qualidade: ${label}`, 4000, 'info');
        console.log('[TAF] Auto-quality via API: set to', label);
        return true;
      }
    } catch (e) {
      console.warn('[TAF] Player API setQuality failed:', e);
    }
  }

  // Fallback: interact with the DOM settings menu
  return await applyMaxQualityViaMenu();
}

/**
 * Fallback: open player menu → Quality → click top option.
 */
async function applyMaxQualityViaMenu() {
  const settingsBtn = document.querySelector('[data-a-target="player-settings-button"]');
  if (!settingsBtn) return false;

  settingsBtn.click();
  await sleep(600);

  const qualityItem = document.querySelector('[data-a-target="player-settings-menu-item-quality"]');
  if (!qualityItem) { closeMenu(); return false; }

  qualityItem.click();
  await sleep(600);

  const options = document.querySelectorAll('[data-a-target="player-settings-submenu-quality-option"]');
  if (options.length === 0) { closeMenu(); return false; }

  const label = options[0].textContent?.trim() || 'Máxima';
  options[0].click();

  await sleep(300);
  const btn = document.querySelector('[data-a-target="player-settings-button"]');
  if (btn) btn.click();

  showNotification(`🎬 Qualidade: ${label}`, 4000, 'info');
  console.log('[TAF] Auto-quality via menu: set to', label);
  return true;
}

function closeMenu() {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Watch for stream changes and apply max quality.
 */
function initAutoQuality() {
  let lastSrc = null;
  let pending = false;

  const observer = new MutationObserver(() => {
    const video = document.querySelector('video');
    if (!video || pending) return;

    if (video.src && video.src !== lastSrc) {
      lastSrc = video.src;
      pending = true;

      // Wait for player to fully load before applying quality
      setTimeout(async () => {
        await applyMaxQuality();
        pending = false;
      }, 3000);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
  console.log('[TAF] Auto-quality initialized (API + menu fallback)');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAutoQuality);
} else {
  initAutoQuality();
}
