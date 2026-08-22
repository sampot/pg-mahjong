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
import {
  actionBarPlan,
  handBackLayout,
  nextTileTap,
  shouldCompactChrome,
  shouldResumeAiAfterAutoToggle,
  turnHintText,
  waitSummaries,
} from "./ux.js";
import {
  MAHJONG_ROLES,
  MAHJONG_SEAT_NAMES,
  roleToSeat,
} from "./protocol.js";
import { readPgSurface } from "./shellSurface.js";
import {
  deriveChromeState,
  shouldShowSoloControls,
} from "./ui-state.js";

const shellSurface = readPgSurface();
document.body.dataset.pgSurface = shellSurface;

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

/** @type {"idle"|"host"|"p2"|"p3"|"p4"|"spectator"} */
let onlineRole = "idle";
/** @type {"waiting"|"ready"|"active"|"ended"|string} */
let onlineStatus = "waiting";
let mySeat = 0;
/** @type {BroadcastChannel | null} */
let sessionChannel = null;
let lastSeq = 0;
let seatPollTimer = 0;
/** @type {number | null} */
let onlineWallCount = null;
/** @type {number[] | null} */
let onlineHandCounts = null;
/** @type {string[]} */
let onlineNames = [...MAHJONG_SEAT_NAMES];
let onlineSeatedCount = 0;

const soloControls = document.getElementById("solo-controls");
const onlineControls = document.getElementById("online-controls");
const onlineMeta = document.getElementById("online-meta");
const btnOnlineDeal = /** @type {HTMLButtonElement | null} */ (
  document.getElementById("btn-online-deal")
);
const btnOnlineReset = /** @type {HTMLButtonElement | null} */ (
  document.getElementById("btn-online-reset")
);
const tagline = document.querySelector(".tagline");
const btnResultOk = /** @type {HTMLButtonElement | null} */ (
  document.getElementById("btn-result-ok")
);
const resultHostHint = document.getElementById("result-host-hint");

function isOnline() {
  return onlineRole !== "idle";
}

function isSpectating() {
  return onlineRole === "spectator";
}

function playerSeat() {
  return isOnline() ? mySeat : PLAYER;
}

/**
 * @param {number} logical
 */
function toVisual(logical) {
  if (!isOnline()) return logical;
  return (logical - mySeat + 4) % 4;
}

/**
 * @param {number} visual
 */
function toLogical(visual) {
  if (!isOnline()) return visual;
  return (visual + mySeat) % 4;
}

/**
 * @param {number} logical
 */
function seatDisplayName(logical) {
  const names = isOnline() ? onlineNames : SEAT_NAMES;
  const name = names[logical] || SEAT_NAMES[logical] || `席${logical + 1}`;
  if (!isOnline()) return name;
  if (isSpectating()) return name;
  return logical === mySeat ? "你" : name;
}

function canControl() {
  return !isSpectating();
}

/**
 * @param {number} logical
 */
function handCountForSeat(logical) {
  if (isOnline() && onlineHandCounts) {
    return onlineHandCounts[logical] ?? 0;
  }
  const extra =
    state.turn === logical && state.drawnTile && state.mustDiscard ? 1 : 0;
  return state.seats[logical].hand.length + extra;
}


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
  turnHint: /** @type {HTMLElement} */ (document.getElementById("turn-hint")),
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
  if (isOnline()) return;
  if (state.phase !== "idle") {
    flash("請先關閉結算或等本局結束。");
    return;
  }
  el.panelResult.hidden = true;
  dispatch({ type: "deal" });
  sfx(() => audio.deal());
});

el.btnAuto.addEventListener("click", () => {
  if (isOnline()) return;
  autoPlayPlayer = !autoPlayPlayer;
  el.btnAuto.setAttribute("aria-pressed", autoPlayPlayer ? "true" : "false");
  el.btnAuto.textContent = autoPlayPlayer ? "取消託管" : "託管";
  selectedId = null;
  clearAi();
  render();
  // Must resume even when turning OFF — otherwise an interrupted opponent
  // discard or claim window never resolves and you never draw on your turn.
  if (shouldResumeAiAfterAutoToggle(autoPlayPlayer)) scheduleAi();
});

el.btnRules.addEventListener("click", () => {
  if (isOnline() && onlineRole !== "host") return;
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
  if (state.phase !== "idle" && (!isOnline() || onlineStatus === "active")) {
    flash("對局中無法改家規，請先結束或重來。");
    return;
  }
  if (isOnline() && onlineRole === "host") {
    void saveRulesOnline(patch);
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
  if (isOnline()) return;
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
  if (isOnline() && onlineRole !== "host") return;
  el.panelResult.hidden = true;
  autoPlayPlayer = false;
  syncAutoButton();
  if (isOnline()) return;
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
  void dispatch({ type: "discard", seat: playerSeat(), tileId }).then((ok) => {
    if (!ok && state.lastError) {
      selectedId = previousSelection;
      flash(state.lastError);
      sfx(() => audio.deny());
    } else if (ok) {
      sfx(() => audio.discard());
    }
  });
}

el.btnHu.addEventListener("click", () => {
  if (autoPlayPlayer || !canControl()) return;
  if (state.phase === "claim") {
    void dispatch({ type: "hu_claim", seat: playerSeat() });
  } else {
    void dispatch({ type: "hu_self", seat: playerSeat() });
  }
  sfx(() => audio.claim());
});

el.btnKong.addEventListener("click", () => {
  if (autoPlayPlayer || !canControl()) return;
  void dispatch({ type: "claim", seat: playerSeat(), intent: { kind: "kong" } });
  sfx(() => audio.claim());
});

el.btnPong.addEventListener("click", () => {
  if (autoPlayPlayer || !canControl()) return;
  void dispatch({ type: "claim", seat: playerSeat(), intent: { kind: "pong" } });
  sfx(() => audio.claim());
});

el.btnChi.addEventListener("click", () => {
  if (autoPlayPlayer || !canControl()) return;
  const opts = listChiOptions(state, playerSeat());
  if (opts.length === 1) {
    void dispatch({
      type: "claim",
      seat: playerSeat(),
      intent: { kind: "chi", chiTiles: opts[0] },
    });
    sfx(() => audio.claim());
    return;
  }
  showChiPicker(opts);
});

el.btnPass.addEventListener("click", () => {
  if (autoPlayPlayer || !canControl()) return;
  void dispatch({ type: "pass_claim", seat: playerSeat() });
  sfx(() => audio.soft());
});

el.btnAnkong.addEventListener("click", () => {
  if (autoPlayPlayer || !canControl()) return;
  const keys = anKongKeys(state, playerSeat());
  if (!keys.length) return;
  if (keys.length === 1) {
    void dispatch({ type: "ankong", seat: playerSeat(), key: keys[0] });
    sfx(() => audio.claim());
    return;
  }
  showKongPicker(keys, "an");
});

el.btnJiakong.addEventListener("click", () => {
  if (autoPlayPlayer || !canControl()) return;
  const ids = jiaKongTileIds(state, playerSeat());
  if (!ids.length) return;
  if (ids.length === 1 || (selectedId != null && ids.includes(selectedId))) {
    const id = selectedId != null && ids.includes(selectedId) ? selectedId : ids[0];
    void dispatch({ type: "jiakong", seat: playerSeat(), tileId: id });
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
 * @returns {Promise<boolean>}
 */
async function dispatch(action) {
  if (isOnline()) {
    if (!canControl()) return false;
    return dispatchOnline(action);
  }
  const prev = state.phase;
  state = applyAction(state, action);
  render();
  if (state.phase === "ended" && prev !== "ended") {
    showResult();
    void audio.win();
    return true;
  }
  scheduleAi();
  return !state.lastError;
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
  if (isOnline()) return;
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
      void dispatch({
        type: "claim",
        seat: playerSeat(),
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
      void dispatch({ type: "ankong", seat: playerSeat(), key });
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
        : state.seats[playerSeat()].hand.find((t) => t.id === id);
    if (!tile) continue;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chi-option";
    btn.appendChild(tileImg(tile.key, true));
    btn.appendChild(document.createTextNode(" 加槓"));
    btn.addEventListener("click", () => {
      el.kongPicker.hidden = true;
      void dispatch({ type: "jiakong", seat: playerSeat(), tileId: id });
      sfx(() => audio.claim());
    });
    el.kongPicker.appendChild(btn);
  }
}

function showResult() {
  const r = state.result;
  if (!r) return;
  el.panelResult.hidden = false;
  if (btnResultOk) {
    btnResultOk.hidden = isOnline() && onlineRole !== "host";
  }
  if (resultHostHint) {
    resultHostHint.hidden = !(isOnline() && onlineRole !== "host");
  }
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
  const name = seatDisplayName(r.winner);
  el.resultTitle.textContent = `${name} 胡牌`;
  const how = r.selfDraw
    ? "自摸"
    : `點炮（${seatDisplayName(r.from ?? 0)}）`;
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
    li.textContent = `${seatDisplayName(i)} ${pay > 0 ? "+" : ""}${pay}`;
    el.resultPay.appendChild(li);
  }
}

function syncLayoutChrome() {
  const online = isOnline();
  const mode = online || shellSurface === "room" ? "online" : "solo";
  const status = online
    ? onlineStatus
    : shellSurface === "room"
      ? onlineStatus || "waiting"
      : state.phase;
  const chrome = deriveChromeState({
    mode,
    status,
    gamePhase: state.phase,
  });
  document.body.dataset.layout = chrome.layout;
  document.body.dataset.onlineRole =
    onlineRole === "spectator"
      ? "spectator"
      : onlineRole === "host"
        ? "host"
        : online && onlineRole !== "idle"
          ? "guest"
          : "";

  const compact =
    chrome.layout === "match" ||
    shouldCompactChrome(state.phase) ||
    (online && onlineStatus === "active");
  document.body.classList.toggle("game-active", compact);

  const showSolo = shouldShowSoloControls({ shellSurface, online });
  if (soloControls) soloControls.hidden = !showSolo;
  syncOnlineControls();
}

function render() {
  syncLayoutChrome();
  el.status.textContent = state.message;
  el.roundWind.textContent = WIND_LABELS[state.roundWind];
  el.dealer.textContent =
    state.phase === "idle" && !state.seats[0].hand.length
      ? seatDisplayName(state.dealer)
      : `${seatDisplayName(state.dealer)}（連${state.dealerStreak}）`;
  el.wall.textContent = String(
    onlineWallCount != null ? onlineWallCount : liveWallCount(state),
  );
  el.minTai.textContent = `${state.ruleset.minTai} 台`;
  if (!isOnline()) {
    el.btnDeal.disabled = state.phase !== "idle";
  }
  el.autoBadge.hidden = !autoPlayPlayer || isOnline();
  el.guoShuiBadge.hidden = !state.guoShui[playerSeat()];

  for (let visual = 0; visual < 4; visual++) {
    const s = toLogical(visual);
    const seatEl = document.querySelector(`[data-seat="${visual}"]`);
    seatEl?.classList.toggle(
      "active-turn",
      state.phase === "playing" && state.turn === s,
    );
    const nameEl = document.getElementById(`name-${visual}`);
    const windEl = document.getElementById(`wind-${visual}`);
    const countEl = document.getElementById(`count-${visual}`);
    const scoreEl = document.getElementById(`score-${visual}`);
    if (nameEl) nameEl.textContent = seatDisplayName(s);
    if (windEl) {
      windEl.textContent =
        state.phase === "idle" && !state.seats[0].hand.length
          ? ""
          : seatWindLabel(state, s);
    }
    if (countEl) {
      countEl.textContent = `${handCountForSeat(s)}張`;
    }
    if (scoreEl) scoreEl.textContent = `${state.scores[s]}分`;

    renderMelds(visual, s);
    renderFlowers(visual, s);
    renderBacks(visual, s);
    renderDiscards(visual, s);
  }

  renderHand();
  renderWaitHint();
  renderLastTile();
  renderActions();
}

function renderWaitHint() {
  if (!el.waitHint) return;
  el.waitHint.replaceChildren();
  if (
    isSpectating() ||
    (state.phase !== "playing" && state.phase !== "claim")
  ) {
    el.waitHint.hidden = true;
    return;
  }
  const seat = playerSeat();
  const melds = state.seats[seat].melds;
  const hand = state.seats[seat].hand;
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
  const label = document.createElement("span");
  label.className = "wait-label";
  label.textContent = "聽";
  el.waitHint.appendChild(label);
  for (const { key, remaining } of waitSummaries(waits, seenTileKeys())) {
    const item = document.createElement("span");
    item.className = "wait-tile" + (remaining === 0 ? " dead" : "");
    item.title = `${tileDef(key).label} 剩 ${remaining} 張`;
    item.appendChild(tileImg(key, true));
    const count = document.createElement("span");
    count.className = "wait-count";
    count.textContent = String(remaining);
    item.appendChild(count);
    el.waitHint.appendChild(item);
  }
}

/** Every tile key already face-up somewhere, for 剩餘張數 on the wait row. */
function seenTileKeys() {
  /** @type {string[]} */
  const keys = [];
  for (const seat of state.seats) {
    for (const meld of seat.melds) {
      for (const t of meld.tiles) keys.push(t.key);
    }
    for (const t of seat.discards) keys.push(t.key);
    for (const t of seat.flowers) keys.push(t.key);
  }
  for (const t of state.seats[playerSeat()].hand) keys.push(t.key);
  if (state.turn === playerSeat() && state.drawnTile) keys.push(state.drawnTile.key);
  return keys;
}

/**
 * @param {number} visual
 * @param {number} logical
 */
function renderBacks(visual, logical) {
  const root = document.getElementById(`backs-${visual}`);
  if (!root) return;
  root.replaceChildren();
  if (visual === 0 && !isSpectating()) return;
  if (state.phase === "idle") return;
  const hasDrawn =
    state.turn === logical && Boolean(state.drawnTile) && state.mustDiscard;
  const handLen = isOnline() && onlineHandCounts
    ? Math.max(0, (onlineHandCounts[logical] ?? 0) - (hasDrawn ? 1 : 0))
    : state.seats[logical].hand.length;
  const { backs, drawn } = handBackLayout(handLen, hasDrawn);
  for (let i = 0; i < backs; i++) {
    root.appendChild(tileImg(null, true, true));
  }
  if (drawn) {
    const tile = tileImg(null, true, true);
    tile.classList.add("drawn-back");
    root.appendChild(tile);
  }
}

function renderHand() {
  el.hand.replaceChildren();
  el.drawnSlot.replaceChildren();
  if (isSpectating()) {
    el.drawnSlot.hidden = true;
    el.hand.setAttribute("aria-label", "觀戰中");
    return;
  }
  const seat = playerSeat();
  const hand = state.seats[seat].hand;
  for (const t of hand) {
    el.hand.appendChild(handTileButton(t, false));
  }

  const drawn =
    state.turn === seat && state.mustDiscard ? state.drawnTile : null;
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
    if (busy || autoPlayPlayer || !canControl()) return;
    const seat = playerSeat();
    if (
      state.phase !== "playing" ||
      state.turn !== seat ||
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
 * @param {number} visual
 * @param {number} logical
 */
function renderMelds(visual, logical) {
  const root = document.getElementById(`melds-${visual}`);
  if (!root) return;
  root.replaceChildren();
  for (const meld of state.seats[logical].melds) {
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
 * @param {number} visual
 * @param {number} logical
 */
function renderFlowers(visual, logical) {
  const root = document.getElementById(`flowers-${visual}`);
  if (!root) return;
  root.replaceChildren();
  for (const t of state.seats[logical].flowers) {
    root.appendChild(tileImg(t.key, true));
  }
}

/**
 * @param {number} visual
 * @param {number} logical
 */
function renderDiscards(visual, logical) {
  const root = document.getElementById(`discards-${visual}`);
  if (!root) return;
  root.replaceChildren();
  const list = state.seats[logical].discards;
  for (const [index, t] of list.entries()) {
    const tile = tileImg(t.key, true);
    if (index >= list.length - 2) tile.classList.add("recent");
    root.appendChild(tile);
  }
}

function renderLastTile() {
  el.lastTile.replaceChildren();
  if (el.turnHint) {
    el.turnHint.textContent = turnHintText({
      phase: state.phase,
      turn: state.turn,
      mustDiscard: Boolean(state.mustDiscard),
      seatName: seatDisplayName(state.turn),
      playerSeat: playerSeat(),
      hasDrawn: Boolean(state.drawnTile),
    });
  }
  const t = state.lastDiscard?.tile || state.claim?.tile;
  if (t) {
    const tile = tileImg(t.key, false);
    tile.classList.add("fresh");
    el.lastTile.appendChild(tile);
    const who = state.claim?.mode === "rob_kong" ? "加槓" : "打出";
    const from = state.lastDiscard?.from ?? state.claim?.from;
    el.lastHint.textContent =
      from == null
        ? `${who} ${tileDef(t.key).label}`
        : `${seatDisplayName(from)} ${who} ${tileDef(t.key).label}`;
  } else {
    el.lastHint.textContent = state.phase === "playing" ? "請打牌" : "尚未打牌";
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

  const seat = playerSeat();
  const onTurn =
    state.phase === "playing" && state.turn === seat && state.mustDiscard;
  const plan = actionBarPlan({
    phase: state.phase,
    autoPlay: autoPlayPlayer || isOnline(),
    isPlayerTurn: state.turn === seat,
    mustDiscard: Boolean(state.mustDiscard),
    claimKinds:
      state.phase === "claim" ? legalClaims(state, seat).map((o) => o.kind) : [],
    claimDone: Boolean(
      state.claim?.passes[seat] || state.claim?.pending[seat],
    ),
    robKong: state.claim?.mode === "rob_kong",
    canHuSelf: onTurn && canHuSelf(state, seat),
    canAnKong: onTurn && anKongKeys(state, seat).length > 0,
    canJiaKong: onTurn && jiaKongTileIds(state, seat).length > 0,
    selectedLabel: selectedTileLabel(),
  });

  /** @type {Record<string, HTMLButtonElement>} */
  const buttons = {
    hu: el.btnHu,
    kong: el.btnKong,
    pong: el.btnPong,
    chi: el.btnChi,
    ankong: el.btnAnkong,
    jiakong: el.btnJiakong,
    discard: el.btnDiscard,
    pass: el.btnPass,
  };
  for (const [kind, btn] of Object.entries(buttons)) {
    btn.hidden = !plan.buttons.includes(kind);
  }
  el.actionPrompt.textContent = plan.prompt;
  el.actionBar.hidden = !plan.visible;
  if (!plan.visible) {
    el.chiPicker.hidden = true;
    el.chiPicker.replaceChildren();
    el.kongPicker.hidden = true;
    el.kongPicker.replaceChildren();
  }
}

function selectedTileLabel() {
  if (selectedId == null) return null;
  const tile =
    state.drawnTile?.id === selectedId
      ? state.drawnTile
      : state.seats[playerSeat()].hand.find((t) => t.id === selectedId);
  return tile ? tileDef(tile.key).label : null;
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

/* ——— Online (mahjong.v1) ——— */

async function online(path, init) {
  const res = await fetch("/api/online" + path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || data.code || res.statusText);
    err.code = data.code;
    throw err;
  }
  return data;
}

async function domain(path, init) {
  const res = await fetch(path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || data.code || res.statusText);
    err.code = data.code;
    throw err;
  }
  return data;
}

async function hostDomain(path, init) {
  const method = (init && init.method) || "GET";
  const headers = (init && init.headers) || undefined;
  const body = init && typeof init.body === "string" ? init.body : undefined;
  return online("/domain", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path, method, headers, body }),
  });
}

/**
 * @param {Record<string, any>} view
 */
function applyOnlineState(view) {
  if (!view || typeof view !== "object") return;
  if (typeof view.seq === "number") lastSeq = Math.max(lastSeq, view.seq);
  onlineStatus = view.status || onlineStatus;
  onlineSeatedCount =
    typeof view.seatedCount === "number"
      ? view.seatedCount
      : onlineSeatedCount;
  if (Array.isArray(view.names)) {
    onlineNames = view.names.map((n) => String(n || ""));
  }
  onlineWallCount =
    typeof view.wallCount === "number" ? view.wallCount : onlineWallCount;
  onlineHandCounts = Array.isArray(view.handCounts)
    ? view.handCounts.map(Number)
    : onlineHandCounts;

  state = {
    ...state,
    phase: view.phase || state.phase,
    turn: typeof view.turn === "number" ? view.turn : state.turn,
    mustDiscard: Boolean(view.mustDiscard),
    dealer: typeof view.dealer === "number" ? view.dealer : state.dealer,
    roundWind:
      typeof view.roundWind === "number" ? view.roundWind : state.roundWind,
    dealerStreak:
      typeof view.dealerStreak === "number"
        ? view.dealerStreak
        : state.dealerStreak,
    scores: Array.isArray(view.scores) ? view.scores : state.scores,
    ruleset: view.ruleset ? { ...state.ruleset, ...view.ruleset } : state.ruleset,
    seats: Array.isArray(view.seats) ? view.seats : state.seats,
    drawnTile: view.drawnTile ?? null,
    lastDiscard: view.lastDiscard ?? null,
    claim: view.claim ?? null,
    guoShui: Array.isArray(view.guoShui) ? view.guoShui : state.guoShui,
    result: view.result ?? null,
    message: view.message || state.message,
    lastError: view.lastError ?? null,
  };

  if (view.channelName) bindSessionChannel(view.channelName);
  if (state.phase === "ended") showResult();
  render();
}

/**
 * @param {Record<string, any>} event
 */
function applyEvent(event) {
  if (!event || typeof event !== "object") return;
  const type = String(event.type || "");
  if (typeof event.seq === "number") {
    if (event.seq <= lastSeq && type !== "session.closed") return;
    lastSeq = Math.max(lastSeq, event.seq);
  }
  if (type === "session.closed") {
    onlineStatus = "waiting";
    state.message =
      event.reason === "host_closed"
        ? "主持已結束這一場"
        : "有人離開，這一局結束";
    syncOnlineControls();
    render();
    return;
  }
  if (type === "match.status") {
    onlineStatus = event.status || onlineStatus;
    onlineSeatedCount =
      typeof event.seatedCount === "number"
        ? event.seatedCount
        : onlineSeatedCount;
    if (Array.isArray(event.names)) {
      onlineNames = event.names.map((n) => String(n || ""));
    }
    if (event.message) state.message = event.message;
    syncOnlineControls();
    render();
    return;
  }
  if (
    type === "match.dealt" ||
    type === "match.action" ||
    type === "match.over" ||
    type === "match.reset" ||
    type === "match.ruleset"
  ) {
    if (event.status) onlineStatus = event.status;
    if (event.message) state.message = event.message;
    if (event.phase) state.phase = event.phase;
    if (type === "match.over") {
      onlineStatus = "ended";
    }
    if (onlineRole === "spectator") {
      selectedId = null;
      void loadOnlineState();
      return;
    }
    void loadOnlineState();
  }
}

function bindSessionChannel(channelName) {
  if (!channelName) return;
  if (sessionChannel) {
    try {
      sessionChannel.close();
    } catch {
      /* ignore */
    }
  }
  sessionChannel = new BroadcastChannel(channelName);
  sessionChannel.onmessage = (ev) => {
    const msg = ev.data;
    if (!msg || msg.type !== "session-event") return;
    if (msg.event) applyEvent(msg.event);
  };
}

async function loadOnlineState() {
  if (onlineRole === "idle") return null;
  if (onlineRole === "spectator") {
    try {
      const stateView = await domain("/api/session/state?role=spectator");
      applyOnlineState(stateView);
      return stateView;
    } catch {
      return null;
    }
  }
  try {
    if (onlineRole === "host") {
      const stateView = await hostDomain(
        `/api/session/state?role=${encodeURIComponent(onlineRole)}`,
        { method: "GET" },
      );
      applyOnlineState(stateView);
      return stateView;
    }
    const data = await domain("/api/session/act", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "sync" }),
    });
    if (data.state) applyOnlineState(data.state);
    return data.state ?? null;
  } catch {
    return null;
  }
}

async function syncSeatedPresence() {
  if (onlineRole !== "host") return;
  try {
    const st = await online("/status");
    const seats = st.seats || [];
    const seatedRoles = ["host"];
    for (const r of MAHJONG_ROLES) {
      if (r === "host") continue;
      if (seats.some((s) => s.role === r)) seatedRoles.push(r);
    }
    if (!seatedRoles.includes("host")) seatedRoles.unshift("host");
    const data = await hostDomain("/api/session/presence", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        seatedRoles,
        seats: seats.map((s) => ({
          role: s.role,
          name: s.name || s.displayName || undefined,
          displayName: s.displayName || s.name || undefined,
        })),
      }),
    });
    if (data.state) applyOnlineState(data.state);
    if (data.events) for (const ev of data.events) applyEvent(ev);
  } catch {
    /* ignore */
  }
}

function startSeatPoll() {
  stopSeatPoll();
  seatPollTimer = window.setInterval(() => {
    void syncSeatedPresence();
  }, 2000);
}

function stopSeatPoll() {
  if (seatPollTimer) {
    clearInterval(seatPollTimer);
    seatPollTimer = 0;
  }
}

function syncOnlineControls() {
  if (!onlineControls) return;
  if (!isOnline()) {
    onlineControls.hidden = true;
    onlineControls.classList.remove("match-bar");
    return;
  }
  const hosting = onlineRole === "host";
  const asSpectator = onlineRole === "spectator";
  const room = shellSurface === "room";
  const inMatch = onlineStatus === "active";
  onlineControls.hidden = false;
  onlineControls.classList.toggle("match-bar", inMatch);
  if (btnOnlineDeal) {
    btnOnlineDeal.hidden = !(hosting && onlineStatus === "ready");
  }
  if (btnOnlineReset) {
    btnOnlineReset.hidden = !(hosting && onlineStatus === "ended");
  }
  if (!onlineMeta) return;
  if (asSpectator) {
    onlineMeta.textContent = room ? "包廂觀戰 · 只看明牌" : "觀戰中 · 只看明牌";
    if (onlineStatus === "active") {
      state.message = `觀戰中 — 輪到 ${seatDisplayName(state.turn)}`;
    } else if (onlineStatus === "ended") {
      state.message = "觀戰 · 本局結束";
    } else if (onlineStatus === "ready") {
      state.message = "觀戰中 — 等候發牌";
    }
    return;
  }
  const roleLabel =
    onlineRole === "host" ? "主持" : `席${mySeat + 1}`;
  if (onlineStatus === "waiting") {
    onlineMeta.textContent = room
      ? `包廂 · ${roleLabel} · 等候滿席（${onlineSeatedCount}/4）`
      : `連線 · ${roleLabel} · 等候滿席`;
  } else if (onlineStatus === "ready") {
    onlineMeta.textContent = hosting
      ? "滿席 — 可發牌開局"
      : "已入座 — 等候主持發牌";
  } else if (onlineStatus === "active") {
    onlineMeta.textContent =
      state.turn === mySeat
        ? "輪到你"
        : `輪到 ${seatDisplayName(state.turn)}`;
  } else if (onlineStatus === "ended") {
    onlineMeta.textContent = hosting ? "終局 — 可再來一局" : "終局 — 等候主持";
  }
}

/**
 * @param {Record<string, unknown>} ruleset
 */
async function saveRulesOnline(ruleset) {
  if (onlineRole !== "host") return;
  try {
    const data = await hostDomain("/api/session/act", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        role: "host",
        payload: { type: "set_ruleset", ruleset },
      }),
    });
    if (data.state) applyOnlineState(data.state);
    el.panelRules.hidden = true;
    flash("家規已套用。");
  } catch (e) {
    flash(String(e.message || e));
  }
}

/**
 * @param {{ type: string, [k: string]: any }} action
 * @returns {Promise<boolean>}
 */
async function dispatchOnline(action) {
  if (busy) return false;
  busy = true;
  try {
    const payload = { ...action, seat: playerSeat() };
    let data;
    if (onlineRole === "host") {
      data = await hostDomain("/api/session/act", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: "host", payload }),
      });
    } else {
      data = await domain("/api/session/act", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    selectedId = null;
    if (data.state) applyOnlineState(data.state);
    if (data.events) for (const ev of data.events) applyEvent(ev);
    if (state.phase === "ended") {
      showResult();
      void audio.win();
    }
    return !state.lastError;
  } catch (e) {
    flash(String(e.message || e));
    return false;
  } finally {
    busy = false;
  }
}

async function onOnlineDeal() {
  if (onlineRole !== "host") return;
  try {
    const data = await hostDomain("/api/session/act", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "host", payload: { type: "deal" } }),
    });
    selectedId = null;
    el.panelResult.hidden = true;
    if (data.state) applyOnlineState(data.state);
    if (data.events) for (const ev of data.events) applyEvent(ev);
    sfx(() => audio.deal());
  } catch (e) {
    flash(String(e.message || e));
  }
}

async function onOnlineReset() {
  if (onlineRole !== "host") return;
  try {
    const data = await hostDomain("/api/session/act", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "host", payload: { type: "reset" } }),
    });
    selectedId = null;
    el.panelResult.hidden = true;
    if (data.state) applyOnlineState(data.state);
    if (data.events) for (const ev of data.events) applyEvent(ev);
    flash("可再發牌開局");
  } catch (e) {
    flash(String(e.message || e));
  }
}

async function tryBootAsPlayer() {
  try {
    const seat = await domain("/api/session/seat");
    if (!seat || seat.ready === false) return false;
    const role = String(seat.role || "");
    if (!MAHJONG_ROLES.includes(role)) return false;
    onlineRole = /** @type {typeof onlineRole} */ (role);
    mySeat = roleToSeat(role);
    const ch = await domain("/api/session/channel");
    if (ch?.name) bindSessionChannel(ch.name);
    await loadOnlineState();
    syncOnlineControls();
    state.message =
      onlineStatus === "ready" || onlineStatus === "active"
        ? "已入座"
        : "已入座 — 等候滿席與發牌";
    render();
    return true;
  } catch {
    return false;
  }
}

async function tryBootAsSpectator() {
  if (shellSurface !== "room") return false;
  try {
    const seat = await domain("/api/session/seat");
    if (!seat || String(seat.role || "") !== "spectator") return false;
    onlineRole = "spectator";
    mySeat = 0;
    selectedId = null;
    const ch = await domain("/api/session/channel");
    if (ch?.name) bindSessionChannel(ch.name);
    await loadOnlineState().catch(() => {});
    syncOnlineControls();
    state.message = "觀戰中 — 四席牌背與明牌同步";
    render();
    return true;
  } catch {
    return false;
  }
}

async function tryBootAsRoomHost() {
  if (shellSurface !== "room") return false;
  try {
    const st = await online("/status");
    if (!st?.active || !st.channelName) return false;
    onlineRole = "host";
    mySeat = 0;
    bindSessionChannel(st.channelName);
    lastSeq = 0;
    try {
      await hostDomain("/api/session/open", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sessionId: st.sessionId,
          channelName: st.channelName,
        }),
      });
    } catch {
      /* may already be open */
    }
    await loadOnlineState();
    startSeatPoll();
    await syncSeatedPresence();
    syncOnlineControls();
    state.message =
      onlineStatus === "ready"
        ? "滿席 — 按「發牌開局」"
        : "包廂開局 — 等候三人入座";
    render();
    return true;
  } catch {
    return false;
  }
}

function applySoloShell() {
  if (soloControls) soloControls.hidden = false;
  if (onlineControls) onlineControls.hidden = true;
  if (tagline) tagline.textContent = "十六張 · 可配家規 · 人機四人";
}

function applyRoomShell() {
  if (soloControls) soloControls.hidden = true;
  if (onlineControls) onlineControls.hidden = false;
  if (tagline) tagline.textContent = "包廂四人連線 · 十六張台灣麻將";
  clearAi();
}

btnOnlineDeal?.addEventListener("click", () => {
  void onOnlineDeal();
});
btnOnlineReset?.addEventListener("click", () => {
  void onOnlineReset();
});

async function bootShellSurface() {
  if (shellSurface === "solo") {
    applySoloShell();
    render();
    return;
  }
  if (shellSurface === "room") {
    applyRoomShell();
    render();
    if (await tryBootAsPlayer()) return;
    if (await tryBootAsSpectator()) return;
    for (let i = 0; i < 20; i++) {
      if (await tryBootAsRoomHost()) return;
      if (await tryBootAsSpectator()) return;
      await new Promise((r) => setTimeout(r, 250));
    }
    state.message = "包廂開局中 — 等候通道就緒…";
    render();
    return;
  }
  applySoloShell();
  render();
  void tryBootAsPlayer();
}

async function boot() {
  try {
    const pg = /** @type {any} */ (window).PG;
    if (pg?.ready && typeof pg.ready.then === "function") {
      await pg.ready;
    }
  } catch {
    /* static serve without host SDK */
  }
  await bootShellSurface();
}

void boot();
