import { isFlower, sortTiles } from "./tiles.js";

/**
 * Opening flower replacement — sequential passes until no flowers in any hand.
 * @param {import('./game.js').GameState} state
 * @param {(s: any) => { tile: any, deadWall: any[], wall: any[] }} takeSupplement
 */
export function replaceAllFlowersPure(state, takeSupplement) {
  let s = state;
  let guard = 0;
  while (guard++ < 120) {
    let progressed = false;
    for (let i = 0; i < 4; i++) {
      const flowerIdx = s.seats[i].hand.findIndex((t) => isFlower(t.key));
      if (flowerIdx < 0) continue;
      progressed = true;
      const flower = s.seats[i].hand[flowerIdx];
      let hand = s.seats[i].hand.filter((t) => t.id !== flower.id);
      let flowers = [...s.seats[i].flowers, flower];
      let wall = s.wall;
      let deadWall = s.deadWall;

      for (;;) {
        const more = takeSupplement({ ...s, wall, deadWall });
        wall = more.wall;
        deadWall = more.deadWall;
        if (!more.tile) break;
        if (isFlower(more.tile.key)) {
          flowers = [...flowers, more.tile];
          continue;
        }
        hand = sortTiles([...hand, more.tile]);
        break;
      }

      const seats = s.seats.map((seat, idx) =>
        idx === i ? { ...seat, hand, flowers } : seat,
      );
      s = { ...s, wall, deadWall, seats };
    }
    if (!progressed) break;
  }
  return s;
}
