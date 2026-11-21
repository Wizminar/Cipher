// QWERTY adjacency graph on a slanted grid, for spotting keyboard walks such as
// "qwerty", "asdfgh" or "1qaz2wsx".

const ROWS = [
  "`~ 1! 2@ 3# 4$ 5% 6^ 7& 8* 9( 0) -_ =+",
  "qQ wW eE rR tT yY uU iI oO pP [{ ]} \\|",
  "aA sS dD fF gG hH jJ kK lL ;: '\"",
  "zZ xX cC vV bB nN mM ,< .> /?",
];
// Every row after the number row starts one slanted column in.
const ROW_OFFSET = [0, 1, 1, 1];

// Six neighbours on a slanted keyboard, as [rowDelta, colDelta].
const DIRECTIONS = [
  [0, -1], [0, 1], [-1, 0], [-1, 1], [1, -1], [1, 0],
];

const position = new Map(); // base key -> [row, col]
const grid = new Map(); // "row,col" -> base key
const unshift = new Map(); // any char -> base (unshifted) key
const shifted = new Set();

ROWS.forEach((row, r) => {
  row.split(" ").forEach((pair, c) => {
    const col = c + ROW_OFFSET[r];
    const [base, shift] = pair;
    position.set(base, [r, col]);
    grid.set(`${r},${col}`, base);
    unshift.set(base, base);
    unshift.set(shift, base);
    shifted.add(shift);
  });
});

/** Direction index from key a to key b, or -1 if they are not adjacent. */
export function direction(a, b) {
  const pa = position.get(unshift.get(a));
  const pb = position.get(unshift.get(b));
  if (!pa || !pb) return -1;
  const dr = pb[0] - pa[0];
  const dc = pb[1] - pa[1];
  return DIRECTIONS.findIndex(([r, c]) => r === dr && c === dc);
}

export const isShifted = (ch) => shifted.has(ch);

export const STARTING_POSITIONS = position.size;

export const AVERAGE_DEGREE = (() => {
  let total = 0;
  for (const [r, c] of position.values()) {
    total += DIRECTIONS.filter(([dr, dc]) => grid.has(`${r + dr},${c + dc}`)).length;
  }
  return total / position.size;
})();
