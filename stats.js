/**
 * Suskaičiuoja bendrą grupių elementų skaičių, ignoruojant tuščias ar neturinčias sąrašo grupes.
 * @param {Array} groups
 * @returns {number}
 */
export function countGroupItems(groups = []) {
  if (!Array.isArray(groups)) return 0;
  return groups.reduce((sum, group) => {
    const items = Array.isArray(group?.items) ? group.items : [];
    return sum + items.length;
  }, 0);
}
