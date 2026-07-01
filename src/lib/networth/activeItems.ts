export function getActiveNetWorthItems<T extends { archived?: boolean }>(items: T[]): T[] {
  return items.filter(item => !item.archived)
}
