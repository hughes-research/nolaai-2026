# Warehouse slotting, re-created on synthetic data

"Slotting" is deciding which shelf slot each part lives in. A fast mover stored
at the far end of the building, or up a ladder, costs time on every pick.

This folder runs a small, honest miniature of a slotting tool from the command
line. It is the same code the deck runs on the slide "slotting-live"
(`deck/lib/slotting-core.js`), and for the same seed it prints the same numbers
the slide shows.

**Everything here is synthetic.** The building, the parts and the year of orders
are generated from a seed. Nothing comes from a real warehouse or a real
business, and these are not anyone's results. The geometry is generic textbook
shelving, not a real floor plan.

## Run it

Needs Node 22. Nothing to install. From the repository root:

```
node demo/slotting/run.js
```

| Option | What it does |
|---|---|
| `--seed N` | a different made-up warehouse (default: the deck's seed) |
| `--parts N` | how many parts; the building grows to fit (default about 1,500) |
| `--orders N` | how many orders in the year (default 2,000) |
| `--iterations N` | how many swaps the optimizer tries (default 240,000) |
| `--sample N` | orders replayed to judge each swap (default: the whole year) |
| `--free-zones` | let the optimizer trade the shelf rules for a shorter walk |
| `--json` | print the results as JSON instead of a table |

It prints the building, a before / after table, the number of swaps tried and
the run time. The run time is a measurement, so it changes from machine to
machine. Every other number is the same on every machine: same seed, same
numbers. The last line is a fingerprint of the whole run; the deck computes the
same one (`__deck.scene('warehouse').debug().fingerprint` in the browser console).

## Changing the synthetic warehouse

The deck and this command read the same settings: the `sim` block under
`slotting` in `deck/content/your-numbers.js`. It ships empty, which means "use
the defaults". Anything you put there changes the slide and the command line
together. For example `sim: { seed: 7 }` is another made-up warehouse, and
`sim: { parts: 2400, orders: 3000 }` is a bigger, busier one (the map on the
slide shrinks to fit).

| Setting | Default | Meaning |
|---|---|---|
| `seed` | 20261113 | which made-up warehouse: same seed, same numbers |
| `parts` | 1560 | how many parts; bays are added so slots are about 1.1 x parts |
| `orders` | 2000 | orders in the year |
| `aisles` | 12 | aisles per block |
| `packAisle` | 1 | the pack station door is at the foot of this aisle |
| `bayWidthFt`, `aislePitchFt`, `aisleWidthFt`, `crossAisleFt` | 5, 10, 3, 6 | the shelving, in feet |
| `walkFtPerSec` | 3 | walking speed |
| `floorSec`, `reachSec` | 3, 3 | extra seconds for a floor or a reach shelf |
| `ladderSetupSec` | 30 | seconds per ladder set-up |
| `affinity`, `familySize` | 0.4, 6 | how strongly, and in what size groups, parts are ordered together |
| `iterations` | 240000 | swaps the optimizer tries |
| `sampleOrders` | 0 | orders replayed to judge a swap; 0 means the whole year |
| `keepZones` | true | keep the shelf rules while searching (see below) |

The command-line options override the file for one run.

## What the model is

| | |
|---|---|
| Building | Two blocks of racks, front and back, with a cross-aisle between them and one along each end. 12 aisles per block. Each aisle has a rack face on either side; each face has bays; each bay has 6 shelf levels. |
| Shelf levels | Level 1 is the floor (a bend). Levels 2 and 3 are the golden zone (waist to shoulder). Level 4 is a reach. Levels 5 and 6 need a ladder. |
| Pack station | At a door on the front wall, at the foot of the first aisle. Every pick run starts and ends there. |
| Parts | About 1,500, with a long tail: a few are picked constantly, most almost never. Classed A (the parts that make up the first 80% of picks), B (the next 15%) and C. |
| Orders | About 2,000 in a year, 1 to 8 lines each, sampled by how often a part is picked, with families of parts that tend to be ordered together. |
| A pick run | Leave the pack station, go to the nearest remaining pick, repeat, come back. Walking follows aisles and cross-aisles, never through a rack. |
| Pick time | Walking at 3 ft per second, plus 3 seconds for a floor shelf, 3 seconds for a reach shelf, and 30 seconds for each ladder set-up (one per ladder bay per order). These times are placeholders, as they would be in any model before a floor time study. |

Two placements are compared:

- **As-is move.** Every part goes across in part-number order, which has nothing
  to do with how often it is picked. Every level gets filled, ladder levels
  included.
- **Optimized.** Start from a rule of thumb: fast movers nearest the pack
  station on golden shelves, medium movers off the ladder, the rest wherever is
  left. Then improve it by simulated annealing: propose a swap of two parts,
  replay the orders that contain them, keep the swap if pick time drops, and
  sometimes keep it when it does not, less often as the search cools.

While it searches, the optimizer keeps two shelf rules of the starting layout: a
fast mover stays in the golden zone, and a medium mover stays off the ladder.
They are rules about reach and strain, not seconds, so they are not traded away
for a shorter walk. `--free-zones` switches them off; the walk gets a little
shorter and fewer fast movers stay at waist height.

No AI model runs at any point. It is arithmetic and a random-number generator.

## What it is not

- Not a slotting product. It has one pack station, no part sizes or weights, no
  slot capacities, and a simple nearest-first route.
- Not evidence about any real building. The size of the improvement depends on
  the made-up inputs, above all on how badly the as-is move scatters the fast
  movers.

## Checking it

```
node tools/test-slotting.js
```

runs the model's tests: every part has exactly one slot and no slot holds two
parts; walking distances are true shortest walks along the aisles (checked
against an independent search) and no route crosses a rack; the yearly figures
are the sum of the individual pick runs; the optimizer beats the as-is move and
gives the same answer however it is sliced; the same seed gives the same numbers
in Node and in a browser, digit for digit; a full run takes under 5 seconds.

## Why the numbers match everywhere

The model uses only whole numbers, `+ - * /` and `Math.sqrt`. Functions such as
`Math.exp` and `Math.log` differ in the last digit between JavaScript engines,
and one differing digit can send a search down a different path, so the model
builds the one it needs (e^-x) from plain arithmetic. Random numbers come from a
small seeded generator, the same one the deck's animation toolkit uses.
