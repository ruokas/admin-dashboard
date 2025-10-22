const groupItemCountCache = new WeakMap();
const groupsTotalCache = new WeakMap();

function getGroupItemCount(group) {
  if (!group || typeof group !== 'object') return 0;
  const items = Array.isArray(group?.items) ? group.items : [];
  const cached = groupItemCountCache.get(group);
  if (cached && cached.items === items && cached.length === items.length) {
    return cached.count;
  }
  const count = items.length;
  groupItemCountCache.set(group, {
    items,
    length: items.length,
    count,
  });
  return count;
}

/**
 * Suskaičiuoja bendrą grupių elementų skaičių, ignoruojant tuščias ar neturinčias sąrašo grupes.
 * Naudoja kaupiamąsias reikšmes, kad būtų išvengta pilnos masyvo iteracijos kiekvienam kvietimui.
 * @param {Array} groups
 * @returns {number}
 */
export function countGroupItems(groups = []) {
  if (!Array.isArray(groups)) return 0;
  const cached = groupsTotalCache.get(groups);
  if (cached && cached.refs?.length === groups.length) {
    let valid = true;
    for (let i = 0; i < groups.length; i += 1) {
      if (cached.refs[i] !== groups[i]) {
        valid = false;
        break;
      }
      const currentCount = getGroupItemCount(groups[i]);
      if (cached.counts[i] !== currentCount) {
        valid = false;
        break;
      }
    }
    if (valid) {
      return cached.total;
    }
  }

  const refs = [];
  const counts = [];
  let total = 0;
  for (let i = 0; i < groups.length; i += 1) {
    const group = groups[i];
    const count = getGroupItemCount(group);
    refs.push(group);
    counts.push(count);
    total += count;
  }
  groupsTotalCache.set(groups, { refs, counts, total });
  return total;
}
