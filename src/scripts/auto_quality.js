/**
 * auto_quality.js
 * Automatically selects the highest available quality when a stream starts.
 * Uses MutationObserver to detect quality buttons in the Twitch player UI.
 */

// Twitch stores quality preference in localStorage under this key
const TWITCH_QUALITY_KEY = 'video-quality';

/**
 * Force the highest quality by setting localStorage and clicking the button.
 * Called whenever the quality menu appears in the DOM.
 */
function forceMaxQuality() {
  // Set localStorage so Twitch remembers "auto" pointing to highest quality
  try {
    const stored = localStorage.getItem(TWITCH_QUALITY_KEY);
    const current = stored ? JSON.parse(stored) : {};

    // Only override if not already set to chunked (source) or 1440p+
    const topQualities = ['chunked', '1440p60', '1080p60'];
    if (!topQualities.includes(current?.default)) {
      localStorage.setItem(
        TWITCH_QUALITY_KEY,
        JSON.stringify({ default: 'chunked' })
      );
    }
  } catch (e) {
    console.warn('[TAF] Could not set quality in localStorage:', e);
  }

  // Also click the quality button in the UI if the menu is open
  clickMaxQualityButton();
}

/**
 * Finds and clicks the highest available quality option in the player menu.
 */
function clickMaxQualityButton() {
  // Quality options appear inside a menu — find all radio/button quality items
  // Twitch uses data-a-target="player-settings-submenu-quality-option" or similar
  const qualityItems = document.querySelectorAll(
    '[data-a-target="player-settings-submenu-quality-option"]'
  );

  if (qualityItems.length > 0) {
    // First item is always the highest quality (Source / 1440p / 1080p)
    qualityItems[0].click();
    console.log(
      '[TAF] Auto-quality: selected',
      qualityItems[0].textContent?.trim()
    );
    return;
  }

  // Fallback: look for radio inputs inside quality menu
  const radioItems = document.querySelectorAll(
    '[data-a-target="player-settings-submenu"] input[type="radio"]'
  );
  if (radioItems.length > 0) {
    radioItems[0].click();
    console.log('[TAF] Auto-quality: selected via radio fallback');
  }
}

/**
 * Watch for the player to load a new stream and trigger quality selection.
 * Twitch re-renders the video element on each channel switch.
 */
function initAutoQuality() {
  let lastSrc = null;
  let qualitySetForCurrentStream = false;

  // Set quality preference in localStorage immediately on load
  forceMaxQuality();

  // Watch for video src changes (new stream) and quality menu appearances
  const observer = new MutationObserver(() => {
    const video = document.querySelector('video');

    if (video && video.src !== lastSrc) {
      lastSrc = video.src;
      qualitySetForCurrentStream = false;

      // Give the player a moment to render the UI, then try to set quality
      setTimeout(() => {
        if (!qualitySetForCurrentStream) {
          forceMaxQuality();
          qualitySetForCurrentStream = true;
        }
      }, 2000);
    }

    // Also react if quality menu opens (user or auto-triggered)
    const qualityMenu = document.querySelector(
      '[data-a-target="player-settings-submenu-quality-option"]'
    );
    if (qualityMenu && !qualitySetForCurrentStream) {
      forceMaxQuality();
      qualitySetForCurrentStream = true;
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false
  });

  console.log('[TAF] Auto-quality initialized — will select highest quality on stream load');
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAutoQuality);
} else {
  initAutoQuality();
}
