// Export menu entries. Kept apart from exporters.js so the editor can list them
// without loading the converters (those load on the first export).
export const TARGETS = [
  { id: 'luau', label: 'Roblox (Luau)', ext: '.client.lua' },
  { id: 'luau-scale', label: 'Roblox (Luau, scale)', ext: '.client.lua' },
  { id: 'rbxmx', label: 'Roblox model (.rbxmx)', ext: '.rbxmx' },
  { id: 'love', label: 'LÖVE 2D (Lua)', ext: '.lua' },
  { id: 'react', label: 'React (JSX)', ext: '.jsx' },
  { id: 'vue', label: 'Vue SFC', ext: '.vue' },
  { id: 'svelte', label: 'Svelte', ext: '.svelte' },
];
