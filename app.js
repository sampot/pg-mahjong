import { chooseAiAction } from "./ai.js";
import { MahjongAudio } from "./audio.js";
import {
  PLAYER,
  anKongKeys,
  applyAction,
  canHuSelf,
  createInitialState,
  jiaKongTileIds,
  legalClaims,
  listChiOptions,
  seatWindLabel,
} from "./game.js";
import { SEAT_NAMES, WIND_LABELS, tileDef } from "./tiles.js";

const audio = new MahjongAudio();
/** @type {import('./game.js').GameState} */
let state = createInitialState();
/** @type {number | null} */
let selectedId = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let aiTimer = null;
let busy = false;

const el = {
  status: /** @type {HTMLElement} */ (document.getElementById("status")),
  roundWind: /** @type {HTMLElement} */ (document.getElementById("round-wind")),
  dealer: /** @type {HTMLElement} */ (document.getElementById("dealer-label")),
  wall: /** @type {HTMLElement} */ (document.getElementById("wall-count")),
  hand: /** @type {HTMLElement} */ (document.getElementById("hand")),
  drawnSlot: /** @type {HTMLElement} */ (document.getElementById("drawn-slot")),
  lastTile: /** @type {HTMLElement} */ (document.getElementById("last-tile")),
  lastHint: /** @type {HTMLElement} */ (document.getElementById("last-tile-hint")),
  actionBar: /** @type {HTMLElement} */ (document.getElementById("action-bar")),
  chiPicker: /** @type {HTMLElement} */ (document.getElementById("chi-picker")),
  panelResult: /** @type {HTMLElement} */ (document.getElementById("panel-result")),
  panelConfirm: /** @type {HTMLElement} */ (document.getElementById("panel-confirm")),
  resultTitle: /** @type {HTMLElement} */ (document.getElementById("result-title")),
  resultBody: /** @type {HTMLElement} */ (document.getElementById("result-body")),
  resultTai: /** @type {HTMLElement} */ (document.getElementById("result-tai")),
  btnMute: /** @type {HTMLButtonElement} */ (document.getElementById("btn-mute")),
  btnDeal: /** @type {HTMLButtonElement} */ (document.getElementById("btn-deal")),
  btnReset: /** @type {HTMLButtonElement} */ (document.getElementById("btn-reset")),
  btnHu: /** @type {HTMLButtonElement} */ (document.getElementById("btn-hu")),
  btnKong: /** @type {HTMLButtonElement} */ (document.getElementById("btn-kong")),
  btnPong: /** @type {HTMLButtonElement} */ (document.getElementById("btn-pong")),
  btnChi: /** @type {HTMLButtonElement} */ (document.getElementById("btn-chi")),
  btnPass: /** @type {HTMLButtonElement} */ (document.getElementById("btn-pass")),
  btnDiscard: /** @type {HTMLButtonElement} */ (document.getElementById("btn-discard")),
  btnAnkong: /** @type {HTMLButtonElement} */ (document.getElementById("btn-ankong")),
  btnJiakong: /** @type {HTMLButtonElement} */ (document.getElementById("btn-jiakong")),
};

document.addEventListener(
  "pointerdown",
  () => {
    void audio.unlock();
  },
  { once: true },
);

el.btnMute.addEventListener("click", () => {
  const on = el.btnMute.getAttribute("aria-pressed") !== "true";
  el.btnMute.setAttribute("aria-pressed", on ? "true" : "false");
  el.btnMute.textContent = on ? "音效開" : "音效關";
  audio.setEnabled(on);
});

el.btnDeal.addEventListener("click", () => {
  if (state.phase === "playing" || state.phase === "claim") return;
  dispatch({ type: "deal" });
  audio.deal();
});

el.btnReset.addEventListener("click", () => {
  if (state.phase === "idle") {
    state = createInitialState();
    selectedId = null;
    render();
    return;
  }
  el.panelConfirm.hidden = false;
});

document.getElementById("btn-confirm-cancel")?.addEventListener("click", () => {
  el.panelConfirm.hidden = true;
});

document.getElementById("btn-confirm-ok")?.addEventListener("click", () => {
  el.panelConfirm.hidden = true;
  clearAi();
  const scores = state.scores;
  const dealer = state.dealer;
  const roundWind = state.roundWind;
  const dealerStreak = state.dealerStreak;
  state = {
    ...createInitialState(),
    scores,
    dealer,
    roundWind,
    dealerStreak,
    message: "已重來。點「開局」再打一局。",
  };
  selectedId = null;
  render();
});

document.getElementById("btn-result-ok")?.addEventListener("click", () => {
  el.panelResult.hidden = true;
  state = {
    ...state,
    phase: "idle",
    message: "點「開局」繼續下一局。",
  };
  render();
});

el.btnDiscard.addEventListener("click", () => {
  if (selectedId == null) {
    audio.deny();
    return;
  }
  dispatch({ type: "discard", seat: PLAYER, tileId: selectedId });
  selectedId = null;
  audio.discard();
});

el.btnHu.addEventListener("click", () => {
  if (state.phase === "claim") {
    dispatch({ type: "hu_claim", seat: PLAYER });
  } else {
    dispatch({ type: "hu_self", seat: PLAYER });
  }
  audio.claim();
});

el.btnKong.addEventListener("click", () => {
  dispatch({ type: "claim", seat: PLAYER, intent: { kind: "kong" } });
  audio.claim();
});

el.btnPong.addEventListener("click", () => {
  dispatch({ type: "claim", seat: PLAYER, intent: { kind: "pong" } });
  audio.claim();
});

el.btnChi.addEventListener("click", () => {
  const opts = listChiOptions(state, PLAYER);
  if (opts.length === 1) {
    dispatch({
      type: "claim",
      seat: PLAYER,
      intent: { kind: "chi", chiTiles: opts[0] },
    });
    audio.claim();
    return;
  }
  showChiPicker(opts);
});

el.btnPass.addEventListener("click", () => {
  dispatch({ type: "pass_claim", seat: PLAYER });
  audio.soft();
});

el.btnAnkong.addEventListener("click", () => {
  const keys = anKongKeys(state, PLAYER);
  if (!keys.length) return;
  dispatch({ type: "ankong", seat: PLAYER, key: keys[0] });
  audio.claim();
});

el.btnJiakong.addEventListener("click", () => {
  const ids = jiaKongTileIds(state, PLAYER);
  if (!ids.length) return;
  const id = selectedId != null && ids.includes(selectedId) ? selectedId : ids[0];
  dispatch({ type: "jiakong", seat: PLAYER, tileId: id });
  selectedId = null;
  audio.claim();
});

/**
 * @param {{ type: string, [k: string]: any }} action
 */
function dispatch(action) {
  const prev = state.phase;
  state = applyAction(state, action);
  render();
  if (state.phase === "ended" && prev !== "ended") {
    showResult();
    audio.win();
    return;
  }
  scheduleAi();
}

function clearAi() {
  if (aiTimer != null) {
    clearTimeout(aiTimer);
    aiTimer = null;
  }
  busy = false;
}

function scheduleAi() {
  clearAi();
  if (state.phase === "ended" || state.phase === "idle") return;

  if (state.phase === "claim") {
    // Player must answer if they have options or always pass eventually
    const playerDone =
      state.claim?.passes[PLAYER] || state.claim?.pending[PLAYER];
    const playerOpts = legalClaims(state, PLAYER);
    if (!playerDone && playerOpts.length) {
      // wait for human
      return;
    }
    if (!playerDone && !playerOpts.length) {
      state = applyAction(state, { type: "pass_claim", seat: PLAYER });
      render();
    }
    busy = true;
    aiTimer = setTimeout(runAiClaims, 380);
    return;
  }

  if (state.phase === "playing" && state.turn !== PLAYER && state.mustDiscard) {
    busy = true;
    aiTimer = setTimeout(() => {
      const action = chooseAiAction(state, state.turn);
      busy = false;
      if (action) {
        state = applyAction(state, action);
        if (action.type === "discard") audio.discard();
        else if (action.type.startsWith("hu") || action.type.includes("kong")) {
          audio.claim();
        }
        render();
        if (state.phase === "ended") {
          showResult();
          audio.win();
          return;
        }
        scheduleAi();
      }
    }, 520);
  }
}

function runAiClaims() {
  busy = false;
  if (state.phase !== "claim" || !state.claim) {
    scheduleAi();
    return;
  }
  for (let s = 0; s < 4; s++) {
    if (state.phase !== "claim" || !state.claim) break;
    if (s === PLAYER) continue;
    if (state.claim.passes[s] || state.claim.pending[s]) continue;
    const action = chooseAiAction(state, s);
    if (action) {
      state = applyAction(state, action);
    }
  }
  // ensure player auto-pass if still open with no opts
  if (
    state.phase === "claim" &&
    state.claim &&
    !state.claim.passes[PLAYER] &&
    !state.claim.pending[PLAYER] &&
    !legalClaims(state, PLAYER).length
  ) {
    state = applyAction(state, { type: "pass_claim", seat: PLAYER });
  }
  render();
  if (state.phase === "ended") {
    showResult();
    audio.win();
    return;
  }
  scheduleAi();
}

/**
 * @param {import('./game.js').Tile[][]} opts
 */
function showChiPicker(opts) {
  el.chiPicker.hidden = false;
  el.chiPicker.replaceChildren();
  for (const pair of opts) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chi-option";
    for (const t of pair) {
      btn.appendChild(tileImg(t.key, true));
    }
    const disc = state.claim?.tile;
    if (disc) btn.appendChild(tileImg(disc.key, true));
    btn.addEventListener("click", () => {
      el.chiPicker.hidden = true;
      dispatch({
        type: "claim",
        seat: PLAYER,
        intent: { kind: "chi", chiTiles: pair },
      });
      audio.claim();
    });
    el.chiPicker.appendChild(btn);
  }
}

function showResult() {
  const r = state.result;
  if (!r) return;
  el.panelResult.hidden = false;
  el.resultTai.replaceChildren();
  if (r.kind === "draw") {
    el.resultTitle.textContent = "流局";
    el.resultBody.textContent = "牌山用盡，本局無勝負。";
    return;
  }
  const name = SEAT_NAMES[r.winner];
  el.resultTitle.textContent = `${name} 胡牌`;
  const how = r.selfDraw ? "自摸" : `點炮（${SEAT_NAMES[r.from ?? 0]}）`;
  el.resultBody.textContent = `${how} · ${r.tai} 台 · ${r.points} 分`;
  for (const line of r.details) {
    const li = document.createElement("li");
    li.textContent = line;
    el.resultTai.appendChild(li);
  }
}

function render() {
  el.status.textContent = state.message;
  el.roundWind.textContent = WIND_LABELS[state.roundWind];
  el.dealer.textContent =
    state.phase === "idle" && !state.seats[0].hand.length
      ? SEAT_NAMES[state.dealer]
      : `${SEAT_NAMES[state.dealer]}（連${state.dealerStreak}）`;
  el.wall.textContent = String(state.wall.length);
  el.btnDeal.disabled = state.phase === "playing" || state.phase === "claim";

  for (let s = 0; s < 4; s++) {
    const nameEl = document.getElementById(`name-${s}`);
    const windEl = document.getElementById(`wind-${s}`);
    const countEl = document.getElementById(`count-${s}`);
    const scoreEl = document.getElementById(`score-${s}`);
    if (nameEl) nameEl.textContent = SEAT_NAMES[s];
    if (windEl) {
      windEl.textContent =
        state.phase === "idle" && !state.seats[0].hand.length
          ? ""
          : seatWindLabel(state, s);
    }
    if (countEl) {
      const extra =
        s === state.turn && state.drawnTile && state.mustDiscard ? 1 : 0;
      countEl.textContent = `${state.seats[s].hand.length + extra}張`;
    }
    if (scoreEl) scoreEl.textContent = `${state.scores[s]}分`;

    renderMelds(s);
    renderFlowers(s);
    renderDiscards(s);
  }

  renderHand();
  renderLastTile();
  renderActions();
}

function renderHand() {
  el.hand.replaceChildren();
  el.drawnSlot.replaceChildren();
  const hand = state.seats[PLAYER].hand;
  for (const t of hand) {
    el.hand.appendChild(handTileButton(t, false));
  }

  const drawn =
    state.turn === PLAYER && state.mustDiscard ? state.drawnTile : null;
  if (drawn) {
    el.drawnSlot.hidden = false;
    el.drawnSlot.appendChild(handTileButton(drawn, true));
  } else {
    el.drawnSlot.hidden = true;
  }
}

/**
 * @param {import('./game.js').Tile} t
 * @param {boolean} isDrawn
 */
function handTileButton(t, isDrawn) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className =
    "tile" +
    (selectedId === t.id ? " selected" : "") +
    (isDrawn ? " drawn" : "");
  btn.setAttribute("role", "option");
  btn.setAttribute("aria-selected", selectedId === t.id ? "true" : "false");
  const label = tileDef(t.key).label;
  btn.title = label;
  if (isDrawn) btn.setAttribute("aria-label", `${label}，剛摸進`);
  const face = document.createElement("span");
  face.className = `tile-face tile-face-${t.key}`;
  face.setAttribute("aria-hidden", "true");
  btn.appendChild(face);
  btn.addEventListener("click", () => {
    if (busy) return;
    if (
      state.phase !== "playing" ||
      state.turn !== PLAYER ||
      !state.mustDiscard
    ) {
      return;
    }
    selectedId = selectedId === t.id ? null : t.id;
    audio.soft();
    render();
  });
  return btn;
}

/**
 * @param {number} seat
 */
function renderMelds(seat) {
  const root = document.getElementById(`melds-${seat}`);
  if (!root) return;
  root.replaceChildren();
  for (const meld of state.seats[seat].melds) {
    const g = document.createElement("div");
    g.className = "meld-group";
    if (meld.concealed && meld.type === "kong") {
      g.appendChild(tileImg(null, true, true));
      g.appendChild(tileImg(meld.tiles[0].key, true));
      g.appendChild(tileImg(meld.tiles[0].key, true));
      g.appendChild(tileImg(null, true, true));
    } else {
      for (const t of meld.tiles) {
        g.appendChild(tileImg(t.key, true));
      }
    }
    root.appendChild(g);
  }
}

/**
 * @param {number} seat
 */
function renderFlowers(seat) {
  const root = document.getElementById(`flowers-${seat}`);
  if (!root) return;
  root.replaceChildren();
  for (const t of state.seats[seat].flowers) {
    root.appendChild(tileImg(t.key, true));
  }
}

/**
 * @param {number} seat
 */
function renderDiscards(seat) {
  const root = document.getElementById(`discards-${seat}`);
  if (!root) return;
  root.replaceChildren();
  const list = state.seats[seat].discards.slice(-12);
  for (const t of list) {
    root.appendChild(tileImg(t.key, true));
  }
}

function renderLastTile() {
  el.lastTile.replaceChildren();
  const t = state.lastDiscard?.tile || state.claim?.tile;
  if (t) {
    el.lastTile.appendChild(tileImg(t.key, false));
    el.lastHint.textContent = `打出 ${tileDef(t.key).label}`;
  } else {
    el.lastHint.textContent =
      state.phase === "playing" ? "請打牌" : "尚未打牌";
  }
}

function renderActions() {
  el.chiPicker.hidden = true;
  el.chiPicker.replaceChildren();
  const show = (btn, on) => {
    btn.hidden = !on;
  };

  let any = false;
  show(el.btnHu, false);
  show(el.btnKong, false);
  show(el.btnPong, false);
  show(el.btnChi, false);
  show(el.btnPass, false);
  show(el.btnDiscard, false);
  show(el.btnAnkong, false);
  show(el.btnJiakong, false);

  if (state.phase === "claim") {
    const opts = legalClaims(state, PLAYER);
    const done = state.claim?.passes[PLAYER] || state.claim?.pending[PLAYER];
    if (!done) {
      for (const o of opts) {
        if (o.kind === "hu") show(el.btnHu, true);
        if (o.kind === "kong") show(el.btnKong, true);
        if (o.kind === "pong") show(el.btnPong, true);
        if (o.kind === "chi") show(el.btnChi, true);
      }
      show(el.btnPass, true);
      any = true;
    }
  } else if (
    state.phase === "playing" &&
    state.turn === PLAYER &&
    state.mustDiscard
  ) {
    show(el.btnDiscard, true);
    any = true;
    if (canHuSelf(state, PLAYER)) {
      show(el.btnHu, true);
    }
    if (anKongKeys(state, PLAYER).length) show(el.btnAnkong, true);
    if (jiaKongTileIds(state, PLAYER).length) show(el.btnJiakong, true);
  }

  el.actionBar.hidden = !any;
}

/**
 * CSS background faces (tiles.css) — works under go-client srcdoc blob rewrite.
 * @param {string | null} key
 * @param {boolean} mini
 * @param {boolean} [forceBack]
 */
function tileImg(key, mini, forceBack = false) {
  const wrap = document.createElement("span");
  wrap.className = "tile" + (mini ? " mini" : "") + (forceBack || !key ? " back" : "");
  const face = document.createElement("span");
  const faceKey = forceBack || !key ? "back" : key;
  face.className = `tile-face tile-face-${faceKey}`;
  face.setAttribute("role", "img");
  face.setAttribute("aria-label", key && !forceBack ? tileDef(key).label : "牌背");
  wrap.appendChild(face);
  return wrap;
}

render();
