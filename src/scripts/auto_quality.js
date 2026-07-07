/**
 * auto_quality.js
 * Automatically selects the highest available quality when a stream starts.
 * Opens the player settings menu, navigates to quality, clicks the top option,
 * then closes the menu — so the player actually registers the change.
 */

import { showNotification } from './ui.js';

// Twitch player UI selectors
const SETTINGS_BTN = '[data-a-target="player-settings-button"]';
const QUALITY_MENU_ITEM = '[data-a-target="player-settings-menu-item-quality"]';
const QUALITY_OPTION = '[data-a-target="player-settings-submenu-quality-option"]';

/**
 * Open settings → Quality → click highest option → close menu.
 * Returns the quality label selected, or null if failed.
 */
async function selectMaxQualityViaMenu() {
  // 1. Click settings gear
  const settingsBtn = document.querySelector(SETTINGS_BTN);
  if (!settingsBtn) return null;
  settingsBtn.click();

  await sleep(600);

  // 2. Click "Quality" submenu item
  const qualityItem = document.querySelector(QUALITY_MENU_ITEM);
  if (!qualityItem) {
    closeMenu();
    return null;
  }
  qualityItem.click();

  await sleep(600);

  // 3. Click the first (highest) quality option
  const options = document.querySelectorAll(QUALITY_OPTION);
  if (options.length === 0) {
    closeMenu();
    return null;
  }

  const label = options[0].textContent?.trim() || 'Máxima';
  options[0].click();

  await sleep(300);

  // 4. Close the settings menu by clicking the gear again
  const settingsBtnAfter = document.querySelector(SETTINGS_BTN);
  if (settingsBtnAfter) settingsBtnAfter.click();

  return label;
}

/**
 * Close any open menu by pressing Escape.
 */
function closeMenu() {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
}

/**
 * Simple sleep helper.
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Main: wait for the video to be playing, then select max quality.
 */
async function applyMaxQuality() {
  const label = await selectMaxQualityViaMenu();

  if (label) {
    showNotification(`🎬 Qualidade: ${label}`, 4000, 'info');
    console.log('[TAF] Auto-quality: selected', label);
  } else {
    // Fallback: set via localStorage so Twitch picks it up on next load
    try {
      localStorage.setItem('video-quality', JSON.stringify({ default: 'chunked' }));
      console.log('[TAF] Auto-quality: set via localStorage fallback');
    } catch (e) {
      console.warn('[TAF] localStorage fallback failed:', e);
    }
  }
}

/**
 * Watch for stream changes (new video src) and trigger quality selection.
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

      // Wait for player controls to render before interacting
      setTimeout(async () => {
        await applyMaxQuality();
        pending = false;
      }, 3000);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  console.log('[TAF] Auto-quality initialized');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAutoQuality);
} else {
  initAutoQuality();
}
