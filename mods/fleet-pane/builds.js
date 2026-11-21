// What a working agent's little builder puts up, block by block (our own pixel art).
// Each build is rows of palette letters, top row first; "." is air.

export const BLOCKS = {
  G: "#4E9A3A", g: "#2F6B2A", T: "#7A5230", R: "#C8472B", W: "#D9C7A0", w: "#7CC4E8", D: "#5A3B22",
  S: "#9AA4AE", s: "#5F6B76", B: "#3A7BD5", Y: "#E8C547", O: "#E07B2A", K: "#3A3A3A", C: "#E6E6E6",
};

export const BUILDS = [
  { name: "a tree", rows: [
    "....GGGG....",
    "..GGGGGGGG..",
    ".GGgGGGGgGG.",
    ".GGGGgGGGGG.",
    "..GGGGGGGG..",
    "....GTTG....",
    ".....TT.....",
    ".....TT.....",
    ".....TT.....",
    "....TTTT....",
  ] },
  { name: "a house", rows: [
    ".....RR.....",
    "....RRRR..K.",
    "...RRRRRR.K.",
    "..RRRRRRRRK.",
    ".RRRRRRRRRR.",
    "..WWWWWWWW..",
    "..WwwWWDDW..",
    "..WwwWWDDW..",
    "..WWWWWDDW..",
    "..WWWWWDDW..",
  ] },
  { name: "a fighter jet", rows: [
    "......S......",
    "......S......",
    ".....SwS.....",
    ".....SwS.....",
    "....SSSSS....",
    "...SSSSSSS...",
    ".SSSSSSSSSSS.",
    "SSS.SSSSS.SSS",
    "....SSSSS....",
    "...sSOsOSs...",
  ] },
  { name: "a rocket", rows: [
    ".....R.....",
    "....RRR....",
    "....CCC....",
    "....CwC....",
    "....CCC....",
    "....CBC....",
    "....CCC....",
    "...RCCCR...",
    "..RRCCCRR..",
    "...O.Y.O...",
  ] },
  { name: "a tower", rows: [
    ".S.S.S.S.",
    ".SSSSSSS.",
    "..SSSSS..",
    "..SSKSS..",
    "..SSSSS..",
    "..SSSSS..",
    "..SSKSS..",
    "..SSSSS..",
    ".SSSDSSS.",
    ".SSSDSSS.",
  ] },
  { name: "a sailboat", rows: [
    ".....K.....",
    "....CK.....",
    "...CCK.....",
    "..CCCKCC...",
    ".CCCCKCCC..",
    ".....K.....",
    "TTTTTTTTTTT",
    ".TTTTTTTTT.",
    "..TTTTTTT..",
    "BBBBBBBBBBB",
  ] },
];

// Blocks go down like real ones: bottom row first, left to right.
export const blockCount = (b) => b.rows.join("").replace(/\./g, "").length;
