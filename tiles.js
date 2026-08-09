/**
 * Taiwan mahjong tile keys, labels, and asset paths.
 * Base faces: FluffyStuff riichi tiles (CC0). Flowers: AI-generated (Gemini), sliced.
 */

/** @typedef {'man'|'pin'|'sou'|'wind'|'dragon'|'flower'} Suit */

/**
 * @typedef {{
 *   key: string,
 *   suit: Suit,
 *   rank: number,
 *   label: string,
 *   file: string,
 * }} TileDef
 */

/** @type {TileDef[]} */
export const TILE_DEFS = [
  ...range(1, 9).map((n) => def(`man${n}`, "man", n, `${n}萬`, `Man${n}.png`)),
  ...range(1, 9).map((n) => def(`pin${n}`, "pin", n, `${n}筒`, `Pin${n}.png`)),
  ...range(1, 9).map((n) => def(`sou${n}`, "sou", n, `${n}索`, `Sou${n}.png`)),
  def("ton", "wind", 0, "東", "Ton.png"),
  def("nan", "wind", 1, "南", "Nan.png"),
  def("shaa", "wind", 2, "西", "Shaa.png"),
  def("pei", "wind", 3, "北", "Pei.png"),
  def("haku", "dragon", 0, "白", "Haku.png"),
  def("hatsu", "dragon", 1, "發", "Hatsu.png"),
  def("chun", "dragon", 2, "中", "Chun.png"),
  def("flower_plum", "flower", 0, "梅", "FlowerPlum.png"),
  def("flower_orchid", "flower", 1, "蘭", "FlowerOrchid.png"),
  def("flower_bamboo", "flower", 2, "竹", "FlowerBamboo.png"),
  def("flower_chrys", "flower", 3, "菊", "FlowerChrys.png"),
  def("season_spring", "flower", 4, "春", "SeasonSpring.png"),
  def("season_summer", "flower", 5, "夏", "SeasonSummer.png"),
  def("season_autumn", "flower", 6, "秋", "SeasonAutumn.png"),
  def("season_winter", "flower", 7, "冬", "SeasonWinter.png"),
];

/** @type {Map<string, TileDef>} */
const BY_KEY = new Map(TILE_DEFS.map((t) => [t.key, t]));

export const BACK_FILE = "Back.png";
export const WIND_KEYS = ["ton", "nan", "shaa", "pei"];
export const WIND_LABELS = ["東", "南", "西", "北"];
export const SEAT_NAMES = ["你", "小梅", "阿北", "黑哥"];

/**
 * @param {string} key
 * @returns {TileDef}
 */
export function tileDef(key) {
  const d = BY_KEY.get(key);
  if (!d) throw new Error(`unknown tile ${key}`);
  return d;
}

/**
 * @param {string} key
 */
export function isFlower(key) {
  return tileDef(key).suit === "flower";
}

/**
 * @param {string} key
 */
export function isHonor(key) {
  const s = tileDef(key).suit;
  return s === "wind" || s === "dragon";
}

/**
 * @param {string} key
 */
export function isSuitTile(key) {
  const s = tileDef(key).suit;
  return s === "man" || s === "pin" || s === "sou";
}

/**
 * @param {string} key
 */
export function assetPath(key) {
  return `./assets/tiles/${tileDef(key).file}`;
}

export function backPath() {
  return `./assets/tiles/${BACK_FILE}`;
}

/**
 * Sort key for hand display (suits → winds → dragons → flowers).
 * @param {string} key
 */
export function sortValue(key) {
  const d = tileDef(key);
  const suitOrder = { man: 0, pin: 1, sou: 2, wind: 3, dragon: 4, flower: 5 };
  return suitOrder[d.suit] * 20 + d.rank;
}

/**
 * @param {{ key: string, id: number }[]} tiles
 */
export function sortTiles(tiles) {
  return [...tiles].sort((a, b) => sortValue(a.key) - sortValue(b.key) || a.id - b.id);
}

/**
 * Build wall: 136 base (×4) + 8 flowers.
 * @returns {{ id: number, key: string }[]}
 */
export function makeWall() {
  /** @type {{ id: number, key: string }[]} */
  const wall = [];
  let id = 0;
  for (const d of TILE_DEFS) {
    const copies = d.suit === "flower" ? 1 : 4;
    for (let i = 0; i < copies; i++) {
      wall.push({ id: id++, key: d.key });
    }
  }
  return wall;
}

/**
 * @param {number} a
 * @param {number} b inclusive
 */
function range(a, b) {
  /** @type {number[]} */
  const out = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

/**
 * @param {string} key
 * @param {Suit} suit
 * @param {number} rank
 * @param {string} label
 * @param {string} file
 * @returns {TileDef}
 */
function def(key, suit, rank, label, file) {
  return { key, suit, rank, label, file };
}
