// Slavic-style plural: plural(5, 'элемент', 'элемента', 'элементов')
export function plural(n, one, few, many){
  const a = Math.abs(parseInt(n, 10)) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b > 1 && b < 5) return few;
  return many;
}
