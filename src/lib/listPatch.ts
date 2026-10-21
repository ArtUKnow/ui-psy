// Incremental saves for list documents: upload only changed items instead of the whole list.
// Mirrors applyListPatch in server-go/patch.go; both sides must produce the same list.
export type ListPatch = { prepend: unknown[]; replace: Record<string, unknown>[]; remove: string[] };

const idOf = (item: unknown) => item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string' && (item as { id: string }).id ? (item as { id: string }).id : null;

export function applyListPatch(base: unknown[], patch: ListPatch): unknown[] {
  const removed = new Set(patch.remove);
  const replaced = new Map(patch.replace.map(item => [idOf(item)!, item]));
  return [...patch.prepend, ...base.flatMap(item => {
    const id = idOf(item);
    if (id && removed.has(id)) return [];
    return [id && replaced.has(id) ? replaced.get(id) : item];
  })];
}

// Returns null when the change is not expressible as a patch or the patch is not smaller; callers then PUT the full list.
export function listPatch(base: unknown, next: unknown): ListPatch | null {
  if (!Array.isArray(base) || !Array.isArray(next)) return null;
  const baseIds = base.map(idOf), nextIds = next.map(idOf);
  if (baseIds.includes(null) || nextIds.includes(null) || new Set(baseIds).size !== base.length || new Set(nextIds).size !== next.length) return null;
  const known = new Set(baseIds);
  let head = 0;
  while (head < next.length && !known.has(nextIds[head])) head++;
  const rest = next.slice(head), restIds = new Set(nextIds.slice(head));
  if (nextIds.slice(head).some(id => !known.has(id))) return null;
  const kept = base.filter((_, index) => restIds.has(baseIds[index]));
  if (kept.some((item, index) => idOf(item) !== idOf(rest[index]))) return null;
  const patch: ListPatch = {
    prepend: next.slice(0, head),
    replace: rest.filter((item, index) => JSON.stringify(item) !== JSON.stringify(kept[index])) as Record<string, unknown>[],
    remove: baseIds.filter(id => !restIds.has(id)) as string[],
  };
  if (JSON.stringify(applyListPatch(base, patch)) !== JSON.stringify(next)) return null;
  return JSON.stringify(patch).length < JSON.stringify(next).length ? patch : null;
}
