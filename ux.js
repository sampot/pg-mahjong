/**
 * Resolve the two-tap discard gesture without coupling it to the DOM.
 * @param {number | null} selectedId
 * @param {number} tileId
 */
export function nextTileTap(selectedId, tileId) {
  return selectedId === tileId
    ? { type: "discard", tileId }
    : { type: "select", tileId };
}

/**
 * @param {string} phase
 */
export function shouldCompactChrome(phase) {
  return phase === "playing" || phase === "claim";
}
