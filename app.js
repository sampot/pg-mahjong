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
  liveWallCount,
  seatWindLabel,
  waitingKeys,
} from "./game.js";
import { SEAT_NAMES, WIND_LABELS, tileDef } from "./tiles.js";
import { DEFAULT_RULESET } from "./ruleset.js";
import { nextTileTap, shouldCompactChrome } from "./ux.js";

const audio = new MahjongAudio();
/** @type {import('./game.js').GameState} */
let state = createInitialState();
/** @type {number | null} */
let selectedId = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let aiTimer = null;
let busy = false;
let autoPlayPlayer = false;
/** @type {'easy'|'standard'} */
let aiDifficulty = "standard";

const el = {
  status: /** @type {HTMLElement} */ (document.getElementById("status")),
  flash: /** @type {HTMLElement} */ (document.getElementById("flash")),
  roundWind: /** @type {HTMLElement} */ (document.getElementById("round-wind")),
  dealer: /** @type {HTMLElement} */ (document.getElementById("dealer-label")),
  wall: /** @type {HTMLElement} */ (document.getElementById("wall-count")),
  minTai: /** @type {HTMLElement} */ (document.getElementById("min-tai-label")),
  hand: /** @type {HTMLElement} */ (document.getElementById("hand")),
  drawnSlot: /** @type {HTMLElement} */ (document.getElementById("drawn-slot")),
  lastTile: /** @type {HTMLElement} */ (document.getElementById("last-tile")),
  lastHint: /** @type {HTMLElement} */ (document.getElementById("last-tile-hint")),
  actionBar: /** @type {HTMLElement} */ (document.getElementById("action-bar")),
  chiPicker: /** @type {HTMLElement} */ (document.getElementById("chi-picker")),
  kongPicker: /** @type {HTMLElement} */ (document.getElementById("kong-picker")),
  panelResult: /** @type {HTMLElement} */ (document.getElementById("panel-result")),
  panelConfirm: /** @type {HTMLElement} */ (document.getElementById("panel-confirm")),
  panelRules: /** @type {HTMLElement} */ (document.getElementById("panel-rules")),
  panelAbout: /** @type {HTMLElement} */ (document.getElementById("panel-about")),
  resultTitle: /** @type {HTMLElement} */ (document.getElementById("result-title")),
  resultBody: /** @type {HTMLElement} */ (document.getElementById("result-body")),
  resultTai: /** @type {HTMLElement} */ (document.getElementById("result-tai")),
  resultPay: /** @type {HTMLElement} */ (document.getElementById("result-pay")),
  resultHand: /** @type {HTMLElement} */ (document.getElementById("result-hand")),
  autoBadge: /** @type {HTMLElement} */ (document.getElementById("auto-badge")),
  guoShuiBadge: /** @type {HTMLElement} */ (document.getElementById("guo-shui-badge")),
  waitHint: /** @type {HTMLElement} */ (document.getElementById("wait-hint")),
  actionPrompt: /** @type {HTMLElement} */ (document.getElementById("action-prompt")),
  btnMute: /** @type {HTMLButtonElement} */ (document.getElementById("btn-mute")),
  btnDeal: /** @type {HTMLButtonElement} */ (document.getElementById("btn-deal")),
  btnReset: /** @type {HTMLButtonElement} */ (document.getElementById("btn-reset")),
  btnRules: /** @type {HTMLButtonElement} */ (document.getElementById("btn-rules")),
  btnAuto: /** @type {HTMLButtonElement} */ (document.getElementById("btn-auto")),
  btnAbout: /** @type {HTMLButtonElement} */ (document.getElementById("btn-about")),
  btnHu: /** @type {HTMLButtonElement} */ (document.getElementById("btn-hu")),
  btnKong: /** @type {HTMLButtonElement} */ (document.getElementById("btn-kong")),
  btnPong: /** @type {HTMLButtonElement} */ (document.getElementById("btn-pong")),
  btnChi: /** @type {HTMLButtonElement} */ (document.getElementById("btn-chi")),
  btnPass: /** @type {HTMLButtonElement} */ (document.getElementById("btn-pass")),
  btnDiscard: /** @type {HTMLButtonElement} */ (document.getElementById("btn-discard")),
  btnAnkong: /** @type {HTMLButtonElement} */ (document.getElementById("btn-ankong")),
  btnJiakong: /** @type {HTMLButtonElement} */ (document.getElementById("btn-jiakong")),
  rulesForm: /** @type {HTMLFormElement} */ (document.getElementById("rules-form")),
};

function sfx(play) {
  void (async () => {
    await audio.unlock();
    await play();
  })();
}

document.addEventListener(
  "pointerdown",
  () => {
    void audio.unlock();
  },
  { passive: true },
);

el.btnMute.addEventListener("click", () => {
  closeMoreMenu();
  const on = el.btnMute.getAttribute("aria-pressed") !== "true";
  el.btnMute.setAttribute("aria-pressed", on ? "true" : "false");
  el.btnMute.textContent = on ? "音效開" : "音效關";
  audio.setEnabled(on);
  if (on) sfx(() => audio.soft());
});

el.btnDeal.addEventListener("click", () => {
  if (state.phase !== "idle") {
    flash("請先關閉結算或等本局結束。");
    return;
  }
  el.panelResult.hidden = true;
  dispatch({ type: "deal" });
  sfx(() => audio.deal());
});

el.btnAuto.addEventListener("click", () => {
  autoPlayPlayer = !autoPlayPlayer;
  el.btnAuto.setAttribute("aria-pressed", autoPlayPlayer ? "true" : "false");
  el.btnAuto.textContent = autoPlayPlayer ? "取消託管" : "託管";
  selectedId = null;
  clearAi();
  render();
  if (autoPlayPlayer) scheduleAi();
});

el.btnRules.addEventListener("click", () => {
  closeMoreMenu();
  fillRulesForm();
  el.panelRules.hidden = false;
});

el.btnAbout.addEventListener("click", () => {
  closeMoreMenu();
  el.panelAbout.hidden = false;
});

document.getElementById("btn-about-ok")?.addEventListener("click", () => {
  el.panelAbout.hidden = true;
});

document.getElementById("btn-rules-cancel")?.addEventListener("click", () => {
  el.panelRules.hidden = true;
});

document.getElementById("btn-rules-save")?.addEventListener("click", () => {
  const fd = new FormData(el.rulesForm);
  const patch = {
    minTai: Number(fd.get("minTai")),
    minTaiExcludesDealerStreakFlowers: fd.get("minTaiExcludesDealerStreakFlowers") === "on",
    pullZhuang: fd.get("pullZhuang") === "on",
    keepDealerOnDraw: fd.get("keepDealerOnDraw") === "on",
    allowRobKong: fd.get("allowRobKong") === "on",
    baXian: fd.get("baXian") === "on",
    qiangYi: fd.get("qiangYi") === "on",
    flowerMode: /** @type {'zheng'|'any'} */ (String(fd.get("flowerMode") || "zheng")),
    basePoints: Number(fd.get("basePoints")),
    taiValue: Number(fd.get("taiValue")),
    taiCap: Number(fd.get("taiCap")),
  };
  aiDifficulty =
    /** @type {'easy'|'standard'} */ (String(fd.get("aiDifficulty") || "standard"));
  if (state.phase !== "idle") {
    flash("對局中無法改家規，請先結束或重來。");
    return;
  }
  state = applyAction(state, { type: "set_ruleset", ruleset: patch });
  el.panelRules.hidden = true;
  flash("家規已套用。");
  render();
});

function fillRulesForm() {
  const r = state.ruleset;
  const f = el.rulesForm;
  /** @type {HTMLSelectElement} */ (f.elements.namedItem("minTai")).value = String(r.minTai);
  /** @type {HTMLInputElement} */ (f.elements.namedItem("minTaiExcludesDealerStreakFlowers")).checked =
    r.minTaiExcludesDealerStreakFlowers;
  /** @type {HTMLInputElement} */ (f.elements.namedItem("pullZhuang")).checked = r.pullZhuang;
  /** @type {HTMLInputElement} */ (f.elements.namedItem("keepDealerOnDraw")).checked =
    r.keepDealerOnDraw;
  /** @type {HTMLInputElement} */ (f.elements.namedItem("allowRobKong")).checked = r.allowRobKong;
  /** @type {HTMLInputElement} */ (f.elements.namedItem("baXian")).checked = r.baXian;
  /** @type {HTMLInputElement} */ (f.elements.namedItem("qiangYi")).checked = r.qiangYi;
  /** @type {HTMLSelectElement} */ (f.elements.namedItem("flowerMode")).value = r.flowerMode;
  /** @type {HTMLInputElement} */ (f.elements.namedItem("basePoints")).value = String(r.basePoints);
  /** @type {HTMLInputElement} */ (f.elements.namedItem("taiValue")).value = String(r.taiValue);
  /** @type {HTMLInputElement} */ (f.elements.namedItem("taiCap")).value = String(r.taiCap);
  /** @type {HTMLSelectElement} */ (f.elements.namedItem("aiDifficulty")).value = aiDifficulty;
}

el.btnReset.addEventListener("click", () => {
  closeMoreMenu();
  if (state.phase === "idle") {
    const ruleset = state.ruleset;
    const scores = state.scores;
    state = { ...createInitialState(ruleset), scores, ruleset };
    selectedId = null;
    autoPlayPlayer = false;
    syncAutoButton();
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
  const ruleset = state.ruleset;
  state = {
    ...createInitialState(ruleset),
    scores,
    dealer,
    roundWind,
    dealerStreak,
    ruleset,
    message: "已重來。點「開局」再打一局。",
  };
  selectedId = null;
  autoPlayPlayer = false;
  syncAutoButton();
  render();
});

document.getElementById("btn-result-ok")?.addEventListener("click", () => {
  el.panelResult.hidden = true;
  autoPlayPlayer = false;
  syncAutoButton();
  state = {
    ...state,
    phase: "idle",
    message: "點「開局」繼續下一局。",
  };
  render();
});

el.btnDiscard.addEventListener("click", () => {
  if (autoPlayPlayer) return;
  if (selectedId == null) {
    flash("請先點選要打的牌。");
    sfx(() => audio.deny());
    return;
  }
  discardTile(selectedId);
});

function discardTile(tileId) {
  const previousSelection = selectedId;
  selectedId = null;
  dispatch({ type: "discard", seat: PLAYER, tileId });
  if (state.lastError) {
    selectedId = previousSelection;
    flash(state.lastError);
    sfx(() => audio.deny());
  } else {
    sfx(() => audio.discard());
  }
  render();
}

el.btnHu.addEventListener("click", () => {
  if (autoPlayPlayer) return;
  if (state.phase === "claim") {
    dispatch({ type: "hu_claim", seat: PLAYER });
  } else {
    dispatch({ type: "hu_self", seat: PLAYER });
  }
  sfx(() => audio.claim());
});

el.btnKong.addEventListener("click", () => {
  if (autoPlayPlayer) return;
  dispatch({ type: "claim", seat: PLAYER, intent: { kind: "kong" } });
  sfx(() => audio.claim());
});

el.btnPong.addEventListener("click", () => {
  if (autoPlayPlayer) return;
  dispatch({ type: "claim", seat: PLAYER, intent: { kind: "pong" } });
  sfx(() => audio.claim());
});

el.btnChi.addEventListener("click", () => {
  if (autoPlayPlayer) return;
  const opts = listChiOptions(state, PLAYER);
  if (opts.length === 1) {
    dispatch({
      type: "claim",
      seat: PLAYER,
      intent: { kind: "chi", chiTiles: opts[0] },
    });
    sfx(() => audio.claim());
    return;
  }
  showChiPicker(opts);
});

el.btnPass.addEventListener("click", () => {
  if (autoPlayPlayer) return;
  dispatch({ type: "pass_claim", seat: PLAYER });
  sfx(() => audio.soft());
});

el.btnAnkong.addEventListener("click", () => {
  if (autoPlayPlayer) return;
  const keys = anKongKeys(state, PLAYER);
  if (!keys.length) return;
  if (keys.length === 1) {
    dispatch({ type: "ankong", seat: PLAYER, key: keys[0] });
    sfx(() => audio.claim());
    return;
  }
  showKongPicker(keys, "an");
});

el.btnJiakong.addEventListener("click", () => {
  if (autoPlayPlayer) return;
  const ids = jiaKongTileIds(state, PLAYER);
  if (!ids.length) return;
  if (ids.length === 1 || (selectedId != null && ids.includes(selectedId))) {
    const id = selectedId != null && ids.includes(selectedId) ? selectedId : ids[0];
    dispatch({ type: "jiakong", seat: PLAYER, tileId: id });
    selectedId = null;
    sfx(() => audio.claim());
    return;
  }
  showJiaKongPicker(ids);
});

function syncAutoButton() {
  el.btnAuto.setAttribute("aria-pressed", autoPlayPlayer ? "true" : "false");
  el.btnAuto.textContent = autoPlayPlayer ? "取消託管" : "託管";
}

function closeMoreMenu() {
  const menu = /** @type {HTMLDetailsElement | null} */ (
    document.getElementById("more-menu")
  );
  if (menu) menu.open = false;
}

/**
 * @param {string} msg
 */
function flash(msg) {
  el.flash.hidden = false;
  el.flash.textContent = msg;
  window.setTimeout(() => {
    el.flash.hidden = true;
  }, 2200);
}

/**
 * @param {{ type: string, [k: string]: any }} action
 */
function dispatch(action) {
  const prev = state.phase;
  state = applyAction(state, action);
  if (state.lastError && action.type === "discard") {
    // keep selection feedback
  }
  render();
  if (state.phase === "ended" && prev !== "ended") {
    showResult();
    void audio.win();
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
    const playerDone =
      state.claim?.passes[PLAYER] || state.claim?.pending[PLAYER];
    const playerOpts = legalClaims(state, PLAYER);
    if (!autoPlayPlayer && !playerDone && playerOpts.length) {
      return;
    }
    if (!playerDone && (!playerOpts.length || autoPlayPlayer)) {
      if (!playerOpts.length) {
        state = applyAction(state, { type: "pass_claim", seat: PLAYER });
        render();
      } else if (autoPlayPlayer) {
        busy = true;
        aiTimer = setTimeout(() => {
          const action = chooseAiAction(state, PLAYER, { difficulty: aiDifficulty });
          busy = false;
          if (action) {
            state = applyAction(state, action);
            render();
            if (state.phase === "ended") {
              showResult();
              void audio.win();
              return;
            }
          }
          scheduleAi();
        }, 380);
        return;
      }
    }
    busy = true;
    aiTimer = setTimeout(runAiClaims, 380);
    return;
  }

  if (state.phase === "playing" && state.mustDiscard) {
    const seat = state.turn;
    if (seat === PLAYER && !autoPlayPlayer) return;
    if (seat !== PLAYER || autoPlayPlayer) {
      busy = true;
      aiTimer = setTimeout(() => {
        const action = chooseAiAction(state, seat, { difficulty: aiDifficulty });
        busy = false;
        if (action) {
          state = applyAction(state, action);
          if (action.type === "discard") void audio.discard();
          else if (action.type.startsWith("hu") || action.type.includes("kong")) {
            void audio.claim();
          }
          render();
          if (state.phase === "ended") {
            showResult();
            void audio.win();
            return;
          }
          scheduleAi();
        }
      }, seat === PLAYER ? 420 : 520);
    }
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
    if (s === PLAYER && !autoPlayPlayer) continue;
    if (state.claim.passes[s] || state.claim.pending[s]) continue;
    const action = chooseAiAction(state, s, { difficulty: aiDifficulty });
    if (action) {
      state = applyAction(state, action);
    }
  }
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
    void audio.win();
    return;
  }
  scheduleAi();
}

/**
 * @param {import('./game.js').Tile[][]} opts
 */
function showChiPicker(opts) {
  el.kongPicker.hidden = true;
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
      sfx(() => audio.claim());
    });
    el.chiPicker.appendChild(btn);
  }
}

/**
 * @param {string[]} keys
 * @param {'an'} _mode
 */
function showKongPicker(keys, _mode) {
  el.chiPicker.hidden = true;
  el.kongPicker.hidden = false;
  el.kongPicker.replaceChildren();
  for (const key of keys) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chi-option";
    btn.appendChild(tileImg(key, true));
    btn.appendChild(document.createTextNode(" 暗槓"));
    btn.addEventListener("click", () => {
      el.kongPicker.hidden = true;
      dispatch({ type: "ankong", seat: PLAYER, key });
      sfx(() => audio.claim());
    });
    el.kongPicker.appendChild(btn);
  }
}

/**
 * @param {number[]} ids
 */
function showJiaKongPicker(ids) {
  el.chiPicker.hidden = true;
  el.kongPicker.hidden = false;
  el.kongPicker.replaceChildren();
  for (const id of ids) {
    const tile =
      state.drawnTile?.id === id
        ? state.drawnTile
        : state.seats[PLAYER].hand.find((t) => t.id === id);
    if (!tile) continue;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chi-option";
    btn.appendChild(tileImg(tile.key, true));
    btn.appendChild(document.createTextNode(" 加槓"));
    btn.addEventListener("click", () => {
      el.kongPicker.hidden = true;
      dispatch({ type: "jiakong", seat: PLAYER, tileId: id });
      sfx(() => audio.claim());
    });
    el.kongPicker.appendChild(btn);
  }
}

function showResult() {
  const r = state.result;
  if (!r) return;
  el.panelResult.hidden = false;
  el.resultTai.replaceChildren();
  el.resultPay.replaceChildren();
  el.resultHand.replaceChildren();
  if (r.kind === "draw") {
    el.resultTitle.textContent = "流局";
    el.resultBody.textContent = state.ruleset.keepDealerOnDraw
      ? "牌山用盡，臭莊連莊。"
      : "牌山用盡，本局無勝負。";
    return;
  }
  const name = SEAT_NAMES[r.winner];
  el.resultTitle.textContent = `${name} 胡牌`;
  const how = r.selfDraw
    ? "自摸"
    : `點炮（${SEAT_NAMES[r.from ?? 0]}）`;
  el.resultBody.textContent = `${how} · ${r.tai} 台 · 基準 ${r.points} 分`;
  for (const meld of state.seats[r.winner].melds) {
    const group = document.createElement("span");
    group.className = "meld-group";
    for (const tile of meld.tiles) group.appendChild(tileImg(tile.key, true));
    el.resultHand.appendChild(group);
  }
  for (const tile of r.tiles) {
    el.resultHand.appendChild(tileImg(tile.key, true));
  }
  for (const line of r.details) {
    const li = document.createElement("li");
    li.textContent = line;
    el.resultTai.appendChild(li);
  }
  for (let i = 0; i < 4; i++) {
    const pay = r.payments[i];
    if (!pay) continue;
    const li = document.createElement("li");
    li.className = pay > 0 ? "payment-positive" : "payment-negative";
    li.textContent = `${SEAT_NAMES[i]} ${pay > 0 ? "+" : ""}${pay}`;
    el.resultPay.appendChild(li);
  }
}

function render() {
  document.body.classList.toggle("game-active", shouldCompactChrome(state.phase));
  el.status.textContent = state.message;
  el.roundWind.textContent = WIND_LABELS[state.roundWind];
  el.dealer.textContent =
    state.phase === "idle" && !state.seats[0].hand.length
      ? SEAT_NAMES[state.dealer]
      : `${SEAT_NAMES[state.dealer]}（連${state.dealerStreak}）`;
  el.wall.textContent = String(liveWallCount(state));
  el.minTai.textContent = `${state.ruleset.minTai} 台`;
  el.btnDeal.disabled = state.phase !== "idle";
  el.autoBadge.hidden = !autoPlayPlayer;
  el.guoShuiBadge.hidden = !state.guoShui[PLAYER];

  for (let s = 0; s < 4; s++) {
    const seatEl = document.querySelector(`[data-seat="${s}"]`);
    seatEl?.classList.toggle(
      "active-turn",
      state.phase === "playing" && state.turn === s,
    );
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
  renderWaitHint();
  renderLastTile();
  renderActions();
}

function renderWaitHint() {
  if (!el.waitHint) return;
  if (state.phase !== "playing" && state.phase !== "claim") {
    el.waitHint.hidden = true;
    return;
  }
  const melds = state.seats[PLAYER].melds;
  const hand = state.seats[PLAYER].hand;
  const needSets = 5 - melds.length;
  if (needSets < 0 || hand.length !== needSets * 3 + 1) {
    el.waitHint.hidden = true;
    return;
  }
  const waits = waitingKeys(melds, hand);
  if (!waits.length) {
    el.waitHint.hidden = true;
    return;
  }
  el.waitHint.hidden = false;
  el.waitHint.textContent = `聽：${waits.map((k) => tileDef(k).label).join("、")}`;
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
    if (busy || autoPlayPlayer) return;
    if (
      state.phase !== "playing" ||
      state.turn !== PLAYER ||
      !state.mustDiscard
    ) {
      return;
    }
    const tap = nextTileTap(selectedId, t.id);
    if (tap.type === "discard") {
      discardTile(tap.tileId);
      return;
    }
    selectedId = tap.tileId;
    void sfx(() => audio.soft());
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
  const list = state.seats[seat].discards.slice(-18);
  for (const [index, t] of list.entries()) {
    const tile = tileImg(t.key, true);
    if (index >= list.length - 2) tile.classList.add("recent");
    root.appendChild(tile);
  }
}

function renderLastTile() {
  el.lastTile.replaceChildren();
  const t = state.lastDiscard?.tile || state.claim?.tile;
  if (t) {
    el.lastTile.appendChild(tileImg(t.key, false));
    const mode = state.claim?.mode === "rob_kong" ? "加槓" : "打出";
    el.lastHint.textContent = `${mode} ${tileDef(t.key).label}`;
  } else {
    el.lastHint.textContent =
      state.phase === "playing" ? "請打牌" : "尚未打牌";
  }
}

function renderActions() {
  if (!el.chiPicker.hidden && el.chiPicker.childElementCount) {
    // keep picker while choosing
  } else {
    el.chiPicker.hidden = true;
    el.chiPicker.replaceChildren();
  }
  if (!el.kongPicker.hidden && el.kongPicker.childElementCount) {
    // keep
  } else {
    el.kongPicker.hidden = true;
    el.kongPicker.replaceChildren();
  }

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

  if (autoPlayPlayer) {
    el.actionBar.hidden = true;
    return;
  }

  if (state.phase === "claim") {
    el.actionPrompt.textContent =
      state.claim?.mode === "rob_kong" ? "可搶槓，請選擇" : "有人打牌，請選擇";
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
    el.actionPrompt.textContent = selectedId == null
      ? "點牌選取；再點一次直接打出"
      : `已選 ${tileDef(
          state.drawnTile?.id === selectedId
            ? state.drawnTile.key
            : state.seats[PLAYER].hand.find((t) => t.id === selectedId)?.key ||
                "man1",
        ).label}，再點一次或按「打出」`;
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

void DEFAULT_RULESET;
render();
