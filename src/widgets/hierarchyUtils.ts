import { RNPlugin, Rem, RemType, RichTextInterface, Card } from '@remnote/plugin-sdk';

// No side effects – safe to import from any widget or utility context.
// This module is the single source of truth for all Rem hierarchy operations.

// =============================================================================
// Special-name constants
// =============================================================================

export const specialNames = [
  'Collapse Tag Configure Options', 'Hide Bullets', 'Status', 'query:', 'query:#',
  'contains:', 'Document', 'Tags', 'Rem With An Alias', 'Highlight', 'Tag', 'Color',
  'Alias', 'Aliases', 'Bullet Icon',
]; // , "Definition", "Eigenschaften"

export const specialNameParts = ['query:', 'contains:'];

// =============================================================================
// Per-run SDK memoization cache
// =============================================================================

export interface RemCache {
  getChildrenRem:      Map<string, Promise<Rem[]>>;
  getType:             Map<string, Promise<RemType>>;
  getParentRem:        Map<string, Promise<Rem | null | undefined>>;
  isDocument:          Map<string, Promise<boolean>>;
  isSlot:              Map<string, Promise<boolean>>;
  isCardItem:          Map<string, Promise<boolean>>;
  getCards:            Map<string, Promise<Card[]>>;
  remsReferencingThis: Map<string, Promise<Rem[]>>;
  taggedRem:           Map<string, Promise<Rem[]>>;
  getRemText:          Map<string, Promise<string>>; // key: `${id}:${extendedName ? 1 : 0}`
}

export function createRemCache(): RemCache {
  return {
    getChildrenRem:      new Map(),
    getType:             new Map(),
    getParentRem:        new Map(),
    isDocument:          new Map(),
    isSlot:              new Map(),
    isCardItem:          new Map(),
    getCards:            new Map(),
    remsReferencingThis: new Map(),
    taggedRem:           new Map(),
    getRemText:          new Map(),
  };
}

export function cGetChildrenRem(rem: Rem, cache: RemCache): Promise<Rem[]> {
  if (!cache.getChildrenRem.has(rem._id)) cache.getChildrenRem.set(rem._id, rem.getChildrenRem());
  return cache.getChildrenRem.get(rem._id)!;
}
export function cGetType(rem: Rem, cache: RemCache): Promise<RemType> {
  if (!cache.getType.has(rem._id)) cache.getType.set(rem._id, rem.getType());
  return cache.getType.get(rem._id)!;
}
export function cGetParentRem(rem: Rem, cache: RemCache): Promise<Rem | null | undefined> {
  if (!cache.getParentRem.has(rem._id)) cache.getParentRem.set(rem._id, rem.getParentRem());
  return cache.getParentRem.get(rem._id)!;
}
export function cIsDocument(rem: Rem, cache: RemCache): Promise<boolean> {
  if (!cache.isDocument.has(rem._id)) cache.isDocument.set(rem._id, rem.isDocument());
  return cache.isDocument.get(rem._id)!;
}
export function cIsSlot(rem: Rem, cache: RemCache): Promise<boolean> {
  if (!cache.isSlot.has(rem._id)) cache.isSlot.set(rem._id, rem.isSlot());
  return cache.isSlot.get(rem._id)!;
}
export function cIsCardItem(rem: Rem, cache: RemCache): Promise<boolean> {
  if (!cache.isCardItem.has(rem._id)) cache.isCardItem.set(rem._id, rem.isCardItem());
  return cache.isCardItem.get(rem._id)!;
}
export function cGetCards(rem: Rem, cache: RemCache): Promise<Card[]> {
  if (!cache.getCards.has(rem._id))
    cache.getCards.set(rem._id, rem.getCards ? rem.getCards() : Promise.resolve([]));
  return cache.getCards.get(rem._id)!;
}
export function cRemsReferencingThis(rem: Rem, cache: RemCache): Promise<Rem[]> {
  if (!cache.remsReferencingThis.has(rem._id))
    cache.remsReferencingThis.set(rem._id, rem.remsReferencingThis());
  return cache.remsReferencingThis.get(rem._id)!;
}
export function cTaggedRem(rem: Rem, cache: RemCache): Promise<Rem[]> {
  if (!cache.taggedRem.has(rem._id)) cache.taggedRem.set(rem._id, rem.taggedRem());
  return cache.taggedRem.get(rem._id)!;
}
export function cGetRemText(
  plugin: RNPlugin, rem: Rem, cache: RemCache, extendedName = false
): Promise<string> {
  const key = `${rem._id}:${extendedName ? 1 : 0}`;
  if (!cache.getRemText.has(key))
    cache.getRemText.set(key, getRemText(plugin, rem, extendedName));
  return cache.getRemText.get(key)!;
}

// =============================================================================
// Rich-text helpers
// =============================================================================

/** Returns the IDs of all rems referenced (via 'q' items) in a RichText array. */
export function getRichTextRefIds(richText: RichTextInterface | undefined): string[] {
  if (!richText) return [];
  const ids: string[] = [];
  for (const item of richText) {
    if (typeof item !== 'string' && item.i === 'q') ids.push(item._id);
  }
  return ids;
}

async function processRichText(
  plugin: RNPlugin, richText: RichTextInterface, showAlias = false
): Promise<string> {
  const parts = await Promise.all(richText.map(async (item) => {
    if (typeof item === 'string') return item;
    switch (item.i) {
      case 'm': return item.text;
      case 'q': {
        const id = showAlias && item.aliasId ? item.aliasId : item._id;
        const ref = await plugin.rem.findOne(id);
        if (ref) return getRemText(plugin, ref);
        if (item.textOfDeletedRem) return processRichText(plugin, item.textOfDeletedRem);
        return '';
      }
      case 'i': return item.url;
      case 'a': return item.url;
      case 'p': return item.url;
      case 'g': return item._id || '';
      case 'x': return item.text;
      case 'n': return item.text;
      case 's': return '';
      default:  return '';
    }
  }));
  return parts.join('');
}

// =============================================================================
// getRemText
// =============================================================================

export async function getRemText(
  plugin: RNPlugin, rem: Rem | undefined, extentedName = false
): Promise<string> {
  if (!rem) return '';

  let richText = rem.text;

  // Special case: text consists of a single reference ('q') or math link ('m').
  if (richText && richText.length === 1 &&
      (richText[0].i === 'q' || richText[0].i === 'm')) {
    let propertyText = '';
    if (richText[0].i === 'q') {
      const referencedRem = await plugin.rem.findOne(richText[0]._id);
      propertyText = await getRemText(plugin, referencedRem);
    }
    if (richText[0].i === 'm') propertyText = richText[0].text;
    const parentRem = rem.getParentRem
      ? await rem.getParentRem()
      : await (await plugin.rem.findOne(rem._id))?.getParentRem();
    const parentText = parentRem ? await getRemText(plugin, parentRem) : '';
    return parentText + ' > ' + propertyText;
  }

  const textPartsPromises = richText
    ? richText.map(async (item) => {
        if (typeof item === 'string') {
          if (extentedName && await rem.getType() === RemType.DESCRIPTOR) {
            const parentRem = await rem.getParentRem();
            if (parentRem) return await getRemText(plugin, parentRem) + '>' + item;
          }
          return item;
        }
        switch (item.i) {
          case 'q': {
            const referencedRem = await plugin.rem.findOne(item._id);
            if (referencedRem) {
              if (extentedName) {
                const refParentRem = await rem.getParentRem();
                if (refParentRem)
                  return await getRemText(plugin, refParentRem, true) + '>' + await getRemText(plugin, referencedRem);
              }
              return getRemText(plugin, referencedRem);
            }
            if (item.textOfDeletedRem) return processRichText(plugin, item.textOfDeletedRem);
            return '';
          }
          case 'i': return item.url;
          case 'a': return item.url;
          case 'p': return item.url;
          case 'g': return item._id || '';
          case 'm':
          case 'x':
          case 'n': {
            if (extentedName && await rem.getType() === RemType.DESCRIPTOR) {
              const parentRem = await rem.getParentRem();
              if (parentRem)
                return await getRemText(plugin, parentRem) + '>' + item.text;
            }
            return item.text;
          }
          case 's': return '';
          default:  return '';
        }
      })
    : [];

  const textParts = await Promise.all(textPartsPromises);

  if (rem.isSlot && await rem.isSlot())
    return await getRemText(plugin, await rem.getParentRem()) + ' > ' + textParts.join('');
  return textParts.join('');
}

// =============================================================================
// Extends / imports helpers
// =============================================================================

export async function getExtendsDescriptor(
  plugin: RNPlugin, rem: Rem, cache?: RemCache
): Promise<Rem | undefined> {
  try {
    const children = cache ? await cGetChildrenRem(rem, cache) : await rem.getChildrenRem();
    for (const child of children) {
      try {
        const [t, name] = await Promise.all([
          cache ? cGetType(child, cache) : child.getType(),
          cache ? cGetRemText(plugin, child, cache) : getRemText(plugin, child),
        ]);
        if (t === RemType.DESCRIPTOR && name.trim().toLowerCase() === 'extends') return child;
      } catch (_) {}
    }
  } catch (_) {}
  return undefined;
}

/** Returns the parent Rems referenced under the "extends" descriptor child of `rem`. */
export async function getExtendsParents(
  plugin: RNPlugin, rem: Rem, cache?: RemCache
): Promise<Rem[]> {
  const ext = await getExtendsDescriptor(plugin, rem, cache);
  if (!ext) return [];
  const resultMap = new Map<string, Rem>();
  try {
    const extChildren = cache ? await cGetChildrenRem(ext, cache) : await ext.getChildrenRem();
    for (const c of extChildren) {
      try {
        const refs = await c.remsBeingReferenced();
        for (const r of refs) if (!resultMap.has(r._id)) resultMap.set(r._id, r);
      } catch (_) {}
    }
  } catch (_) {}
  return Array.from(resultMap.values());
}

export async function isReferencingRem(plugin: RNPlugin, rem: Rem): Promise<boolean> {
  if (!rem) return false;
  const parents = await getExtendsParents(plugin, rem);
  return parents.length > 0;
}

/** Returns the "imports" descriptor child of `rem`, if present. */
export async function getImportsDescriptor(
  plugin: RNPlugin, rem: Rem
): Promise<Rem | undefined> {
  try {
    const children = await rem.getChildrenRem();
    for (const child of children) {
      try {
        const [t, name] = await Promise.all([child.getType(), getRemText(plugin, child)]);
        if (t === RemType.DESCRIPTOR && name.trim().toLowerCase() === 'imports') return child;
      } catch (_) {}
    }
  } catch (_) {}
  return undefined;
}

/** Returns the child Rems referenced under the "imports" descriptor child of `rem`. */
export async function getImportsChildren(plugin: RNPlugin, rem: Rem): Promise<Rem[]> {
  const imp = await getImportsDescriptor(plugin, rem);
  if (!imp) return [];
  const resultMap = new Map<string, Rem>();
  try {
    const impChildren = await imp.getChildrenRem();
    for (const c of impChildren) {
      try {
        const refs = await c.remsBeingReferenced();
        for (const r of refs) if (!resultMap.has(r._id)) resultMap.set(r._id, r);
      } catch (_) {}
    }
  } catch (_) {}
  return Array.from(resultMap.values());
}

// =============================================================================
// resolveExtendsOwner
// =============================================================================

/**
 * Walk up from `referencingRem` until we find the Rem that owns an "extends"
 * DESCRIPTOR; return its parent (the class that is doing the extending).
 */
export async function resolveExtendsOwner(
  plugin: RNPlugin, referencingRem: Rem, cache?: RemCache
): Promise<Rem | undefined> {
  const visited = new Set<string>();
  let current: Rem | undefined = referencingRem;

  while (current) {
    if (visited.has(current._id)) break;
    visited.add(current._id);

    const type = cache ? await cGetType(current, cache) : await current.getType();
    const parent: Rem | null | undefined = cache
      ? await cGetParentRem(current, cache)
      : await current.getParentRem();

    if (type === RemType.DESCRIPTOR) {
      const name = cache
        ? (await cGetRemText(plugin, current, cache)).trim().toLowerCase()
        : (await getRemText(plugin, current)).trim().toLowerCase();
      if (name === 'extends') return parent ?? undefined;
    }

    current = parent ?? undefined;
  }

  return undefined;
}

// =============================================================================
// Clean-children helpers
// =============================================================================

/** Structural children only, filtered for special names and extends/imports. */
export async function getCleanChildren(
  plugin: RNPlugin, rem: Rem, cache?: RemCache
): Promise<Rem[]> {
  const childrenRems = cache ? await cGetChildrenRem(rem, cache) : await rem.getChildrenRem();
  const cleanChildren: Rem[] = [];

  for (const childRem of childrenRems) {
    const [text, type] = await Promise.all([
      cache ? cGetRemText(plugin, childRem, cache) : getRemText(plugin, childRem),
      cache ? cGetType(childRem, cache) : childRem.getType(),
    ]);
    const baseName = text.includes(' > ') ? text.split(' > ').pop()!.trim() : text.trim();
    const normalized = baseName.toLowerCase();

    if (type === RemType.DESCRIPTOR && (normalized === 'extends' || normalized === 'imports')) continue;

    if (
      !specialNames.includes(text) && !specialNames.includes(baseName) &&
      !specialNameParts.some((p) => text.startsWith(p)) &&
      !specialNameParts.some((p) => baseName.startsWith(p))
    ) {
      cleanChildren.push(childRem);
    }
  }

  return cleanChildren;
}

/**
 * Full logical children: structural children PLUS extends-based children
 * (Rems that reference this Rem via an "extends" descriptor elsewhere in
 * the knowledge base), de-duplicated and filtered for special names.
 *
 * This is the function that buildRemXml must use to walk the real hierarchy.
 */
export async function getCleanChildrenAll(
  plugin: RNPlugin, rem: Rem, cache?: RemCache
): Promise<Rem[]> {
  const [childrenRems, referencingRems] = await Promise.all([
    cache ? cGetChildrenRem(rem, cache) : rem.getChildrenRem(),
    cache ? cRemsReferencingThis(rem, cache) : rem.remsReferencingThis(),
  ]);

  const normalizedReferencing: Rem[] = [];
  for (const ref of referencingRems) {
    const owner = await resolveExtendsOwner(plugin, ref, cache);
    if (owner && owner._id !== rem._id) {
      normalizedReferencing.push(owner);
      continue;
    }
    normalizedReferencing.push(ref);
  }

  const allRems = [...childrenRems, ...normalizedReferencing];
  const uniqueRemsMap = new Map<string, Rem>();
  for (const r of allRems) if (!uniqueRemsMap.has(r._id)) uniqueRemsMap.set(r._id, r);
  const uniqueRems = Array.from(uniqueRemsMap.values());

  const [texts, types] = await Promise.all([
    Promise.all(uniqueRems.map((r) => cache ? cGetRemText(plugin, r, cache) : getRemText(plugin, r))),
    Promise.all(uniqueRems.map((r) => cache ? cGetType(r, cache) : r.getType())),
  ]);

  const cleanRems: Rem[] = [];
  for (let i = 0; i < uniqueRems.length; i++) {
    const text = texts[i];
    const type = types[i];
    const baseName = text.includes(' > ') ? text.split(' > ').pop()!.trim() : text.trim();
    const normalized = baseName.toLowerCase();

    if (
      specialNames.includes(text) || specialNames.includes(baseName) ||
      specialNameParts.some((p) => text.startsWith(p)) ||
      specialNameParts.some((p) => baseName.startsWith(p)) ||
      (type === RemType.DESCRIPTOR && (normalized === 'extends' || normalized === 'imports'))
    ) continue;

    cleanRems.push(uniqueRems[i]);
  }

  return cleanRems;
}

/** Structural children only (no extends-based), filtered for special names. */
export async function getCleanChildrenOnly(plugin: RNPlugin, rem: Rem): Promise<Rem[]> {
  const childrenRems = await rem.getChildrenRem();

  const [texts, types] = await Promise.all([
    Promise.all(childrenRems.map((r) => getRemText(plugin, r))),
    Promise.all(childrenRems.map((r) => r.getType())),
  ]);

  const cleanRems: Rem[] = [];
  for (let i = 0; i < childrenRems.length; i++) {
    const text = texts[i];
    const type = types[i];
    const baseName = text.includes(' > ') ? text.split(' > ').pop()!.trim() : text.trim();
    const normalized = baseName.toLowerCase();

    if (
      specialNames.includes(text) || specialNames.includes(baseName) ||
      specialNameParts.some((p) => text.startsWith(p)) ||
      specialNameParts.some((p) => baseName.startsWith(p)) ||
      (type === RemType.DESCRIPTOR && (normalized === 'extends' || normalized === 'imports'))
    ) continue;

    cleanRems.push(childrenRems[i]);
  }

  return cleanRems;
}
