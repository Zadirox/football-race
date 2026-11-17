const PALETTES = [
  ['#d8ff74', '#8fd0f0'],
  ['#ffd08a', '#e4573d'],
  ['#c7b8ff', '#5aa9e6'],
  ['#a8f0d8', '#4fae8a'],
  ['#ffe08a', '#f2c14e'],
  ['#f6b6c8', '#c05c7a'],
];

export function avatarColor(name: string, index: number): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 997;
  const palette = PALETTES[hash % PALETTES.length] ?? PALETTES[0]!;
  return palette[index] ?? palette[0]!;
}
