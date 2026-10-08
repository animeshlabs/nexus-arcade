/* validates the Pac-Man maze: row lengths, borders, connectivity */
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/../assets/js/games/pacman.js', 'utf8');
const m = src.match(/const RAW = \[([\s\S]*?)\];/);
const rows = m[1].match(/'([^']*)'/g).map(s => s.slice(1, -1));
let fail = 0;
const W = 28, H = 31;
if (rows.length !== H) { console.log('FAIL rows=' + rows.length); fail++; }
rows.forEach((r, i) => { if (r.length !== W) { console.log(`FAIL row ${i} len=${r.length}: "${r}"`); fail++; } });

/* flood fill from Pac spawn (13,23) — every dot must be reachable */
const open = (x, y) => y >= 0 && y < H && x >= 0 && x < W && rows[y][x] !== '#';
const seen = new Set(), q = [[13, 23]];
seen.add('13,23');
while (q.length) {
  const [x, y] = q.pop();
  for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
    let nx = x + dx, ny = y + dy;
    if (ny === 14) { if (nx < 0) nx = W - 1; if (nx >= W) nx = 0; }
    const k = nx + ',' + ny;
    if (!seen.has(k) && open(nx, ny)) { seen.add(k); q.push([nx, ny]); }
  }
}
let dots = 0, unreachable = 0;
rows.forEach((r, y) => [...r].forEach((c, x) => {
  if (c === '.' || c === 'o') { dots++; if (!seen.has(x + ',' + y)) { unreachable++; console.log(`UNREACHABLE dot at ${x},${y}`); } }
}));
console.log(`dots=${dots} unreachable=${unreachable} reachableCells=${seen.size}`);

/* door checks: above door (13,11) open, inside house open */
[[13,11],[13,13],[13,14],[11,14],[15,14],[0,14],[27,14],[13,23]].forEach(([x,y]) => {
  if (!open(x,y)) { console.log(`FAIL expected open at ${x},${y} ("${rows[y][x]}")`); fail++; }
});
if (rows[12][13] !== '-' || rows[12][14] !== '-') { console.log('FAIL door tiles'); fail++; }
console.log(fail === 0 && unreachable === 0 ? 'MAZE OK' : `MAZE FAIL (${fail})`);
