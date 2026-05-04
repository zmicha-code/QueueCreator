import { PowerupSlotCodeMap, usePlugin, renderWidget, Queue, Rem, Card, RNPlugin, RemType, RichTextInterface, RepetitionStatus, QueueInteractionScore, EventCallbackFn, AppEvents, BuiltInPowerupCodes, useTracker, CardData
} from '@remnote/plugin-sdk';
import { useEffect, useState } from 'react';
// import MyRemNoteButton from '../components/MyRemNoteButton';
import MyRemNoteButton, { MyRemNoteButtonSmall } from '../components/MyRemnoteButton';
import { MyRemNoteQueue } from '../components/MyRemnoteQueue';

// -> AbstractionAndInheritance
export const specialNames = ["Collapse Tag Configure Options", "Hide Bullets", "Status", "query:", "query:#", "contains:", "Document", "Tags", "Rem With An Alias", "Highlight", "Tag", "Color", "Alias", "Aliases", "Bullet Icon"]; // , "Definition", "Eigenschaften"

export const specialNameParts = ["query:", "contains:"];

// =============================================================================
// Per-run SDK memoization cache
// =============================================================================
// Each entry stores a Promise (not a resolved value) so that concurrent requests
// for the same rem coalesce onto a single in-flight network call.
// The cache is created once per loadRemQueue run inside getCardsOfRem and
// discarded afterward, so there are no staleness concerns.

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

function cGetChildrenRem(rem: Rem, cache: RemCache): Promise<Rem[]> {
  if (!cache.getChildrenRem.has(rem._id)) cache.getChildrenRem.set(rem._id, rem.getChildrenRem());
  return cache.getChildrenRem.get(rem._id)!;
}
function cGetType(rem: Rem, cache: RemCache): Promise<RemType> {
  if (!cache.getType.has(rem._id)) cache.getType.set(rem._id, rem.getType());
  return cache.getType.get(rem._id)!;
}
function cGetParentRem(rem: Rem, cache: RemCache): Promise<Rem | null | undefined> {
  if (!cache.getParentRem.has(rem._id)) cache.getParentRem.set(rem._id, rem.getParentRem());
  return cache.getParentRem.get(rem._id)!;
}
function cIsDocument(rem: Rem, cache: RemCache): Promise<boolean> {
  if (!cache.isDocument.has(rem._id)) cache.isDocument.set(rem._id, rem.isDocument());
  return cache.isDocument.get(rem._id)!;
}
function cIsSlot(rem: Rem, cache: RemCache): Promise<boolean> {
  if (!cache.isSlot.has(rem._id)) cache.isSlot.set(rem._id, rem.isSlot());
  return cache.isSlot.get(rem._id)!;
}
function cIsCardItem(rem: Rem, cache: RemCache): Promise<boolean> {
  if (!cache.isCardItem.has(rem._id)) cache.isCardItem.set(rem._id, rem.isCardItem());
  return cache.isCardItem.get(rem._id)!;
}
function cGetCards(rem: Rem, cache: RemCache): Promise<Card[]> {
  if (!cache.getCards.has(rem._id)) cache.getCards.set(rem._id, rem.getCards ? rem.getCards() : Promise.resolve([]));
  return cache.getCards.get(rem._id)!;
}
function cRemsReferencingThis(rem: Rem, cache: RemCache): Promise<Rem[]> {
  if (!cache.remsReferencingThis.has(rem._id)) cache.remsReferencingThis.set(rem._id, rem.remsReferencingThis());
  return cache.remsReferencingThis.get(rem._id)!;
}
function cTaggedRem(rem: Rem, cache: RemCache): Promise<Rem[]> {
  if (!cache.taggedRem.has(rem._id)) cache.taggedRem.set(rem._id, rem.taggedRem());
  return cache.taggedRem.get(rem._id)!;
}
function cGetRemText(plugin: RNPlugin, rem: Rem, cache: RemCache, extendedName = false): Promise<string> {
  const key = `${rem._id}:${extendedName ? 1 : 0}`;
  if (!cache.getRemText.has(key)) cache.getRemText.set(key, getRemText(plugin, rem, extendedName));
  return cache.getRemText.get(key)!;
}

export async function getExtendsDescriptor(plugin: RNPlugin, rem: Rem, cache?: RemCache): Promise<Rem | undefined> {
  try {
    const children = cache ? await cGetChildrenRem(rem, cache) : await rem.getChildrenRem();
    for (const child of children) {
      try {
        const [t, name] = await Promise.all([
          cache ? cGetType(child, cache) : child.getType(),
          cache ? cGetRemText(plugin, child, cache) : getRemText(plugin, child),
        ]);
        if (t === RemType.DESCRIPTOR && name.trim().toLowerCase() === "extends") {
          return child;
        }
      } catch (_) {}
    }
  } catch (_) {}
  return undefined;
}

// Builds the set of all property IDs that are "known" to the root rem:
// for each direct DESCRIPTOR or DOCUMENT child P of rem, includes P itself
// plus all IDs in P's ancestor and descendant property-hierarchy chains.
// Used to filter out "new" properties introduced by descendants.
// Walks the extends-parent chain of a property rem upward until it finds the root
// (a rem with no extends parents). Returns that root rem.
async function getPropertyRootAncestor(
  plugin: RNPlugin, rem: Rem, cache?: RemCache, visited = new Set<string>()
): Promise<Rem> {
  if (visited.has(rem._id)) return rem;
  visited.add(rem._id);
  const parents = await getExtendsParents(plugin, rem, cache);
  if (parents.length === 0) return rem;
  return getPropertyRootAncestor(plugin, parents[0], cache, visited);
}

// Returns the parent Rems referenced under the "extends" descriptor child of `rem`.
export async function getExtendsParents(plugin: RNPlugin, rem: Rem, cache?: RemCache): Promise<Rem[]> {
  const ext = await getExtendsDescriptor(plugin, rem, cache);
  if (!ext) return [];
  const resultMap = new Map<string, Rem>();
  try {
    const extChildren = cache ? await cGetChildrenRem(ext, cache) : await ext.getChildrenRem();
    for (const c of extChildren) {
      try {
        const refs = await c.remsBeingReferenced();
        for (const r of refs) {
          if (!resultMap.has(r._id)) resultMap.set(r._id, r);
        }
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

// Returns the "imports" descriptor child of `rem`, if present.
export async function getImportsDescriptor(plugin: RNPlugin, rem: Rem): Promise<Rem | undefined> {
  try {
    const children = await rem.getChildrenRem();
    for (const child of children) {
      try {
        const [t, name] = await Promise.all([child.getType(), getRemText(plugin, child)]);
        if (t === RemType.DESCRIPTOR && name.trim().toLowerCase() === "imports") {
          return child;
        }
      } catch (_) {}
    }
  } catch (_) {}
  return undefined;
}

// Returns the child Rems referenced under the "imports" descriptor child of `rem`.
export async function getImportsChildren(plugin: RNPlugin, rem: Rem): Promise<Rem[]> {
  const imp = await getImportsDescriptor(plugin, rem);
  if (!imp) return [];
  const resultMap = new Map<string, Rem>();
  try {
    const impChildren = await imp.getChildrenRem();
    for (const c of impChildren) {
      try {
        const refs = await c.remsBeingReferenced();
        for (const r of refs) {
          if (!resultMap.has(r._id)) resultMap.set(r._id, r);
        }
      } catch (_) {}
    }
  } catch (_) {}
  return Array.from(resultMap.values());
}

// -> AbstractionAndInheritance
async function processRichText(plugin: RNPlugin, richText: RichTextInterface, showAlias = false): Promise<string> {
    const textPartsPromises = richText.map(async (item) => {
    if (typeof item === "string") {
    return item;
    }
    switch (item.i) {
    case 'm': return item.text;
    case 'q':
    const id = showAlias && item.aliasId ? item.aliasId : item._id;
    
    const referencedRem = await plugin.rem.findOne(id);
    if (referencedRem) {
        return await getRemText(plugin, referencedRem);
    } else if (item.textOfDeletedRem) {
        return await processRichText(plugin, item.textOfDeletedRem);
    }
    return "";
    case 'i': return item.url;
    case 'a': return item.url;
    case 'p': return item.url;
    case 'g': return item._id || "";
    case 'x': return item.text;
    case 'n': return item.text;
    case 's': return "";
    default: return "";
    }
    });

    const textParts = await Promise.all(textPartsPromises);
    return textParts.join("");
}

// -> AbstractionAndInheritance
export async function getRemText(plugin: RNPlugin, rem: Rem | undefined, extentedName = false): Promise<string> {
    if (!rem) return "";

    let richText = rem.text;

    // Special case, where text of rem only consists of a reference.
    // q: Ref
    // m: Link
    if(richText && richText.length == 1 && (richText[0].i == 'q' || richText[0].i == 'm')) {

      let propertyText = "";

      if(richText[0].i == 'q') {
        const referencedRem = await plugin.rem.findOne(richText[0]._id);
        propertyText = await getRemText(plugin, referencedRem)
      }

      if(richText[0].i == 'm') {
        propertyText = richText[0].text;
      }

      const parentRem =  rem.getParentRem ? await rem.getParentRem() : await (await plugin.rem.findOne(rem._id))?.getParentRem(); // await rem.getParentRem() -> "getParentRem is not a function"
      const parentText = parentRem ? await getRemText(plugin, parentRem) : "";

      return parentText + " > " + propertyText;
    }

    const textPartsPromises = richText ? richText.map(async (item) => {
    if (typeof item === "string") {
      if(extentedName && await rem.getType() == RemType.DESCRIPTOR) {
        const parentRem = await rem.getParentRem();

        if(parentRem)
            return await getRemText(plugin, parentRem) + ">" + item;
      }
      return item;
    }

    switch (item.i) {
    case 'q':
      const referencedRem = await plugin.rem.findOne(item._id);
      if (referencedRem) {
          if(extentedName) {
          const refParentRem = await rem.getParentRem();

          if(refParentRem)
              return await getRemText(plugin, refParentRem, true) + ">" + await getRemText(plugin, referencedRem);
          }

          return await getRemText(plugin, referencedRem);
      } else if (item.textOfDeletedRem) {
          return await processRichText(plugin, item.textOfDeletedRem);
      }
      return "";
    case 'i': return item.url;
    case 'a': return item.url;
    case 'p': return item.url;
    case 'g': return item._id || "";
    case 'm':
    case 'x': 
    case 'n':
      if(extentedName && await rem.getType() == RemType.DESCRIPTOR) {
          const parentRem = await rem.getParentRem();

          if(parentRem)
              return await getRemText(plugin, parentRem) + ">" + item.text;
      }
      return item.text;
      case 's': return "";
      default: return "";
    }
    }) : [];

    const textParts = await Promise.all(textPartsPromises);

    if(rem.isSlot && await rem.isSlot())
        return await getRemText(plugin, await rem.getParentRem()) + " > " + textParts.join("");
    else
        return textParts.join("");
}

// -> AbstractionAndInheritance
async function getCleanChildren(plugin: RNPlugin, rem: Rem, cache?: RemCache): Promise<Rem[]> {
  const childrenRems = cache ? await cGetChildrenRem(rem, cache) : await rem.getChildrenRem();
  const cleanChildren: Rem[] = [];

  for (const childRem of childrenRems) {
    const [text, type] = await Promise.all([
      cache ? cGetRemText(plugin, childRem, cache) : getRemText(plugin, childRem),
      cache ? cGetType(childRem, cache) : childRem.getType(),
    ]);
    const baseName = text.includes(' > ') ? text.split(' > ').pop()!.trim() : text.trim();
    const normalized = baseName.toLowerCase();

    if (type === RemType.DESCRIPTOR && (normalized === "extends" || normalized === "imports")) {
      continue;
    }

    if (!specialNames.includes(text) && !specialNames.includes(baseName) &&
        !specialNameParts.some((part) => text.startsWith(part)) && !specialNameParts.some((part) => baseName.startsWith(part))) {
      cleanChildren.push(childRem);
    }
  }

  return cleanChildren;
}

async function resolveExtendsOwner(
  plugin: RNPlugin,
  referencingRem: Rem,
  cache?: RemCache
): Promise<Rem | undefined> {
  const visited = new Set<string>();
  let current: Rem | undefined = referencingRem;

  while (current) {
    if (visited.has(current._id)) {
      break;
    }
    visited.add(current._id);

    const type = cache ? await cGetType(current, cache) : await current.getType();
    const parent: Rem | null | undefined = cache ? await cGetParentRem(current, cache) : await current.getParentRem();

    if (type === RemType.DESCRIPTOR) {
      const name = cache
        ? (await cGetRemText(plugin, current, cache)).trim().toLowerCase()
        : (await getRemText(plugin, current)).trim().toLowerCase();
      if (name === "extends") {
        return parent ?? undefined;
      }
    }

    current = parent ?? undefined;
  }

  return undefined;
}

// -> AbstractionAndInheritance
export async function getCleanChildrenAll(plugin: RNPlugin, rem: Rem, cache?: RemCache): Promise<Rem[]> {
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
  for (const r of allRems) {
    if (!uniqueRemsMap.has(r._id)) {
      uniqueRemsMap.set(r._id, r);
    }
  }
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
      specialNameParts.some((part) => text.startsWith(part)) || specialNameParts.some((part) => baseName.startsWith(part)) ||
      (type === RemType.DESCRIPTOR && (normalized === "extends" || normalized === "imports"))
    ) {
      continue;
    }

    cleanRems.push(uniqueRems[i]);
  }

  return cleanRems;
}

// Returns only structural children (no references), filtered for special names
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
      specialNameParts.some((part) => text.startsWith(part)) || specialNameParts.some((part) => baseName.startsWith(part)) ||
      (type === RemType.DESCRIPTOR && (normalized === "extends" || normalized === "imports"))
    ) {
      continue;
    }

    cleanRems.push(childrenRems[i]);
  }

  return cleanRems;
}

// -> AbstractionAndInheritance
export async function getAncestorLineage(plugin: RNPlugin, rem: Rem, cache?: RemCache): Promise<Rem[][]> {
  const lineages = await findPaths(plugin, rem, [rem], cache);
  return lineages;
}

// Returns the IDs of all ancestor classes of rem (excludes rem itself).
export async function getAncestorIds(plugin: RNPlugin, rem: Rem, cache?: RemCache): Promise<Set<string>> {
  const lineages = await getAncestorLineage(plugin, rem, cache);
  const ids = new Set<string>();
  for (const lineage of lineages) {
    for (const ancestor of lineage) {
      if (ancestor._id !== rem._id) ids.add(ancestor._id);
    }
  }
  return ids;
}

// Returns the IDs of all class-hierarchy descendants of rem (excludes rem itself).
// Only traverses class-like rems: skips DESCRIPTORs (direct properties),
// DOCUMENTs (regular properties), and flashcards (leaf nodes).
export async function getDescendantIds(
  plugin: RNPlugin,
  rem: Rem,
  visited: Set<string> = new Set([rem._id]),
  cache?: RemCache
): Promise<Set<string>> {
  const ids = new Set<string>();
  const children = await getCleanChildrenAll(plugin, rem, cache);
  for (const child of children) {
    if (visited.has(child._id)) continue;
    const type = cache ? await cGetType(child, cache) : await child.getType();
    // Skip structural sub-properties of this rem only (not extends-based descendants
    // that happen to be descriptors or documents belonging to another class).
    const parent = cache ? await cGetParentRem(child, cache) : await child.getParentRem();
    const isDirectChild = !parent || parent._id === rem._id;
    if (type === RemType.DESCRIPTOR && isDirectChild) continue;
    const childIsDoc = cache ? await cIsDocument(child, cache) : await child.isDocument();
    if (childIsDoc && isDirectChild) continue;
    if (await isFlashcard(plugin, child, cache)) {
      // Leaf node — add to exclusion set but don't recurse into it.
      visited.add(child._id);
      ids.add(child._id);
      continue;
    }
    visited.add(child._id);
    ids.add(child._id);
    const childDescendants = await getDescendantIds(plugin, child, visited, cache);
    for (const did of childDescendants) ids.add(did);
  }
  return ids;
}

async function findPaths(plugin: RNPlugin, currentRem: Rem, currentPath: Rem[], cache?: RemCache): Promise<Rem[][]> {
  const parents = (await getParentClass(plugin, currentRem, cache)) || [];

  if (parents.length === 1 && parents[0]._id === currentRem._id) {
    return [currentPath];
  } else {
    const allPaths: Rem[][] = [];
    for (const parent of parents) {
      if (!currentPath.some(r => r._id === parent._id)) {
        const parentPaths = await findPaths(plugin, parent, [...currentPath, parent], cache);
        allPaths.push(...parentPaths);
      }
    }
    return allPaths;
  }
}

export async function getParentClass(plugin: RNPlugin, rem: Rem, cache?: RemCache): Promise<Rem[]> {
  if (!rem) return [];

  const [isDocument, directParent, extendsParents] = await Promise.all([
    cache ? cIsDocument(rem, cache) : rem.isDocument(),
    cache ? cGetParentRem(rem, cache) : rem.getParentRem(),
    getExtendsParents(plugin, rem, cache),
  ]);

  // Property (document): inherits via extends, otherwise defines a new type
  if (isDocument) {
    if (extendsParents.length > 0) return extendsParents;
    return [rem];
  }

  // Interface (non-document): first the structural parent, then any extends parents
  const result: Rem[] = [];
  if (directParent) result.push(directParent);
  for (const p of extendsParents) if (!result.some((r) => r._id === p._id)) result.push(p);
  return result.length > 0 ? result : [rem];
}

// Function to get the closest class parent for a Rem
export async function getParentClass_(plugin: RNPlugin, rem: Rem): Promise<Rem[] | null> {
  if (!rem) return null;

  const parent = await rem.getParentRem();
  const type = await rem.getType();
  const isReferencing = await isReferencingRem(plugin, rem);
  const isDocument = await rem.isDocument();
  const isSlot = await rem.isSlot();
  const tags = await getCleanTags(plugin, rem);

  // DOCUMENT with TAGS. This should never happen. A DOCUMENT should always define a new type and therefore have no parents through tags.
  if (isDocument && tags.length > 0) {
    await plugin.app.toast('Mistake: DOCUMENT with TAG. (' + await getRemText(plugin, rem) + ")");
    //return tags[0];
    return null;
  } 

  //
  if(isDocument && isReferencing) {
    const referencedRem = (await rem.remsBeingReferenced())[0];

    return [referencedRem];
  }

  // DOCUMENT without TAGS. Defines a new Type. Has no other parent Type
  if (isDocument)
    return [rem];

  // SLOT with TAG.
  // NEW: We dont use TAGS for inheritance any more
  if(isSlot && tags.length > 0) {
    await plugin.app.toast('Mistake: SLOT with TAG. (' + await getRemText(plugin, rem) + ")");
    //return [tags[0]];
    return null
  }

  if(isSlot && isReferencing) {
    const referencedRem = (await rem.remsBeingReferenced())[0];
    return [referencedRem]
  }

  // SLOT without TAG: Property of new Type
  if(isSlot) {
    //await plugin.app.toast('Mistake: SLOT without TAG.' + (await getRemText(plugin, rem)) + ")");
    return [rem];
  }

  // CONCEPT, DOCUMENT, without TAGS
  // Case already covered with isDocument
  //if(type === RemType.CONCEPT && isDocument && tags.length == 0) {
  //  return rem;
  //}

  // CONCEPT with TAGS
  // OLD: Inherits Type from TAG
  // NEW: Inheritance no longer through TAGS but with REFS like in the case of DESCRIPTORS instead
  if (type === RemType.CONCEPT && tags.length > 0) {
    await plugin.app.toast('Mistake: CONCEPT with TAG. (' + await getRemText(plugin, rem) + ")");
    return [tags[0]];
  } 

  // Inherits Type from REF
  if(type === RemType.CONCEPT && isReferencing) {
    const referencedRem = (await rem.remsBeingReferenced())[0];

    if(parent && await isSameBaseType(plugin, referencedRem, parent))
      return [parent, referencedRem]

    return [referencedRem];
  }
  
  // Concept, without TAGS
  // Inherits Type from Rem Parent
  if (type === RemType.CONCEPT && tags.length == 0) {

      if(!parent) return [rem]; // || await getRemText(plugin, parent) == "Eigenschaften" || await getRemText(plugin, parent) == "Definition"

      return [parent];
  } 

  // DESCRIPTOR with TAG. Should this happen? Cant think of a usecase
  if(type == RemType.DESCRIPTOR && !isReferencing && tags.length > 0) {
    //await plugin.app.toast('Potential Mistake: DESCRIPTOR with TAG.');
    //return [tags[0]];

    if(!parent) return null;

    return [parent];
}

  // DESCRIPTOR without TAG
  // Defines an interface with the type of the parent rem
  if(type == RemType.DESCRIPTOR && !isReferencing && tags.length == 0) {
    // Soon deprecated
    if(!parent) return null; // || await getRemText(plugin, parent) == "Eigenschaften" || await getRemText(plugin, parent) == "Definition"

    return [parent];
  }

  // REF DESCRIPTOR with TAG
  // TODO?

  // REF DESCRIPTOR without TAG
  // Implements a layer with type of reference
  if (type === RemType.DESCRIPTOR && isReferencing) {
      const referencedRem = (await rem.remsBeingReferenced())[0];

      const referencedClass = referencedRem; //await getParentClassType(plugin, referencedRem);

      if(await referencedRem.isDocument()) {
        //console.log("Referenced Rem is document");

        return [referencedClass];
      }

      // Special case (Interface implementation/Same Type): referenced Rem's parent is an ancestor of descriptor's parent
      // TODO: Multiple lineages?
      if (referencedClass && parent && await isSameBaseType(plugin, referencedClass, parent)) { // await isClassAncestor(plugin, referencedClass, parent)

        // TODO:

        //console.log("We are here");

        return [parent, referencedClass];
      } else {
        // Inherit from the referenced Rem's class type
        //return getClassType(plugin, referencedRem);

        //console.log("REF DESCRIPTOR " + await getRemText(plugin, rem) + " is of type " + await getRemText(plugin, referencedRem));

        return [referencedRem];
      }
  }

  return null; // Default case, though should be handled above
} 

export async function getBaseType(plugin: RNPlugin, rem: Rem): Promise<Rem> {
  // Retrieve all ancestor lineages
  const lineages = await getAncestorLineage(plugin, rem);
  
  // If there are no ancestors, the base type is the rem itself
  if (!lineages || lineages.length === 0) {
    return rem;
  }

  // Choose the first lineage (primary path) and take its last element
  const primaryLineage = lineages[0];
  if (primaryLineage.length === 0) {
    return rem;
  }

  return primaryLineage[primaryLineage.length - 1];
}

export async function isSameBaseType(
  plugin: RNPlugin,
  rem1: Rem,
  rem2: Rem
): Promise<boolean> {
  const [base1, base2] = await Promise.all([
    getBaseType(plugin, rem1),
    getBaseType(plugin, rem2),
  ]);

  return base1._id === base2._id;
}

export const specialTags = ["Document", "Template Slot", "Tag", "Tags", "Header", "Deck", "Flashcards", "Rem With An Alias", "Automatically Sort", "Document", "Highlight", "Hide Bullets", "Status"];

export async function getCleanTags(plugin: RNPlugin, rem: Rem): Promise<Rem[]> {
  const tagRems = await rem.getTagRems();
  const cleanTags: Rem[] = [];
  for (const tagRem of tagRems) {
    const text = await getRemText(plugin, tagRem);
    if (!specialTags.includes(text)) {
      cleanTags.push(tagRem);
    }
  }
  return cleanTags;
}

// -> index.tsx
function formatMilliseconds(ms : number, abs = false): string {
  let isNegative = false;

  if (ms === 0) return 'New Card'; // Special case for zero // "0 seconds"
  if (ms < 0) {
    isNegative = true;
    ms = Math.abs(ms);    // Handle negatives with absolute value
  }

  const millisecondsInSecond = 1000;
  const millisecondsInMinute = millisecondsInSecond * 60;
  const millisecondsInHour = millisecondsInMinute * 60;
  const millisecondsInDay = millisecondsInHour * 24;

  let value, unit;

  if (ms >= millisecondsInDay) {
      value = ms / millisecondsInDay;
      unit = 'day';
  } else if (ms >= millisecondsInHour) {
      value = ms / millisecondsInHour;
      unit = 'hour';
  } else if (ms >= millisecondsInMinute) {
      value = ms / millisecondsInMinute;
      unit = 'minute';
  } else if (ms >= millisecondsInSecond) {
      value = ms / millisecondsInSecond;
      unit = 'second';
  } else {
      value = ms;
      unit = 'millisecond';
  }

  // Round to 2 decimal places for clean output
  value = Math.round(value * 100) / 100;

  // Pluralize unit if value isnâ€™t 1
  const plural = value !== 1 ? 's' : '';
  //return `${value} ${unit}${plural}`;
  return (isNegative && !abs ? "-" : "") + value + " " + unit + plural;
}

async function isFlashcard(plugin: RNPlugin, rem: Rem, cache?: RemCache): Promise <boolean> {

  const cards = cache ? await cGetCards(rem, cache) : (rem.getCards ? await rem.getCards() : []);
  if (cards.length > 0) return true;

  const children = await getCleanChildren(plugin, rem, cache);

  for(const c of children) {
    if(cache ? await cIsCardItem(c, cache) : await c.isCardItem())
      return true;
  }

  return false;
}

interface SearchOptions {
  includeThisRem: boolean,
  includeAncestors: boolean,
  includeDescendants: boolean,
  dueOnly: boolean,
  disabledOnly: boolean,
  referencedOnly: boolean,
  ratingOnly: boolean,
  ratingFilter: QueueInteractionScore, // 0 Skip, 1 Forgot, ..., 4 Easily Recalled
  includePortals: boolean,
  //invertedDirection: boolean, // Inverted mean up. Instead of collecting flashcards from descendants
  includeReferencedCard: boolean,
  includeReferencingCard: boolean,
  includeReferencedRem: boolean,
  includeReferencingRem: boolean,
  includeTaggedRem: boolean, // Include flashcards that are tagged with this rem
  includeEigenschaften: boolean, // Include flashcards from the Eigenschaften subtree of each rem
  excludeNewProperties: boolean, // When true, skip properties in descendants that have no "extends" child (i.e. newly defined, not inherited)
  knownPropertyRootIds?: Set<string>, // Pre-computed set of root ancestor IDs for all known properties of the selected rem
  maximumNumberOfCards: number,
  // TODO: includeReferencedCard, includeReferencingCard, includeReferencedRem, includeReferencingRem â€” not yet wired into the new card-collection architecture
}

// Helper function assumed to be defined elsewhere
//function isDue(card: Card): boolean {
function isDue(card: SearchData): boolean {
  if (!card.card) return false; // Disabled flashcards have no card, treat as not due
  const lastInterval = getLastInterval(card.card.repetitionHistory);
  return lastInterval ? lastInterval.intervalSetOn + lastInterval.workingInterval - Date.now() < 0 : true;
}

// A rem is disabled if it's a flashcard (has children with isCardItem) but getCards returns empty
async function isDisabled(plugin: RNPlugin, rem: Rem): Promise<boolean> {
  const cards = await rem.getCards();
  if (cards.length > 0) {
    return false; // Has cards, so not disabled
  }
  // Check if it's a flashcard by looking for isCardItem children
  return await isFlashcard(plugin, rem);
}

export interface SearchData {
  rem: Rem,
  card: Card | null  // null for disabled flashcards
}

// 
async function addFlashcard(plugin: RNPlugin,
                        rem: Rem,
                        cards: SearchData[],
                        searchOptions: SearchOptions,
                        addedCardIds: Set<string>,
                        //isRef: boolean,
                        cardPath:string) {
  const remCards = rem.getCards ? await rem.getCards() : [];

  for (const card of remCards) {
    if (!addedCardIds.has(card._id)) {
      addedCardIds.add(card._id);

      //console.log("Adding " + await getRemText(plugin, rem) + " (" + cardPath + ")");

      //if (!searchOptions.dueOnly || isDue(card)) {

        //if(!searchOptions.referencedOnly || isRef) {
          cards.push({rem: rem, card: card});
        //}
      //}
    } //else {
      // CORRECT?: If the card was added through Reference but is also included in the normal Hierarchy (not through ref) delete it if referencedOnly = true
      //if (searchOptions.referencedOnly && !isRef) {
      //  const index = cards.findIndex(c => c._id === card._id);
      //  if (index !== -1) {
      //    cards.splice(index, 1);
      //  }
      //  }
    //}
  }
}

// Add a disabled flashcard (no card object) to the collection
async function addDisabledFlashcard(plugin: RNPlugin,
                                     rem: Rem,
                                     cards: SearchData[],
                                     addedRemIds: Set<string>,
                                     cardPath: string) {
  if (!addedRemIds.has(rem._id)) {
    addedRemIds.add(rem._id);
    cards.push({ rem: rem, card: null });
  }
}

// =============================================================================
// Card Collection: shared context
// =============================================================================

// Shared mutable state threaded through all card-collection functions.
// Created once per top-level getCardsOfRem call; passed to all sub-functions.
interface CardCollectionContext {
  addedCardIds: Set<string>;        // dedup enabled cards globally
  addedDisabledRemIds: Set<string>; // dedup disabled cards globally
  excludedPropertyIds: Set<string>; // unchecked property IDs from the UI
  processedRemIds: Set<string>;     // cycle / revisit guard
  includedPropertyRootIds: Set<string> | null; // null = no filter; non-null = set of root ancestor IDs for the selected rem's known property types
  cache: RemCache;                  // per-run SDK call memoization
}

// Add all cards from a rem (known to be a flashcard) to results, using ctx for dedup.
async function collectFlashcardToCtx(
  plugin: RNPlugin, rem: Rem, results: SearchData[], ctx: CardCollectionContext
): Promise<void> {
  const remCards = await cGetCards(rem, ctx.cache);
  if (remCards.length > 0) {
    for (const card of remCards) {
      if (!ctx.addedCardIds.has(card._id)) {
        ctx.addedCardIds.add(card._id);
        results.push({ rem, card });
      }
    }
  } else {
    // No cards returned but rem is a flashcard â†’ it is disabled
    if (!ctx.addedDisabledRemIds.has(rem._id)) {
      ctx.addedDisabledRemIds.add(rem._id);
      results.push({ rem, card: null });
    }
  }
}

// =============================================================================
// Card Collection: Eigenschaften
// =============================================================================

// DFS over raw children (no filtering â€” Eigenschaften content is trusted).
// Adds every flashcard in the subtree. Guards against cycles via processedRemIds.
async function getAllFlashcardsInSubtree(
  plugin: RNPlugin, rem: Rem, results: SearchData[], ctx: CardCollectionContext
): Promise<void> {
  if (ctx.processedRemIds.has(rem._id)) return;
  ctx.processedRemIds.add(rem._id);

  if (await isFlashcard(plugin, rem, ctx.cache)) {
    await collectFlashcardToCtx(plugin, rem, results, ctx);
  }

  const children = await cGetChildrenRem(rem, ctx.cache);
  for (const child of children) {
    await getAllFlashcardsInSubtree(plugin, child, results, ctx);
  }
}

// Collect all flashcards from the "Eigenschaften"/"Properties" DESCRIPTOR child of rem.
async function getCardsOfEigenschaften(
  plugin: RNPlugin, rem: Rem, ctx: CardCollectionContext
): Promise<SearchData[]> {
  const results: SearchData[] = [];
  const rawChildren = await cGetChildrenRem(rem, ctx.cache);
  for (const child of rawChildren) {
    const type = await cGetType(child, ctx.cache);
    if (type !== RemType.DESCRIPTOR) continue;
    const name = await cGetRemText(plugin, child, ctx.cache);
    const baseName = name.includes(' > ') ? name.split(' > ').pop()!.trim() : name.trim();
    const baseNorm = baseName.toLowerCase();
    if (baseNorm === 'eigenschaften' || baseNorm === 'properties') {
      await getAllFlashcardsInSubtree(plugin, child, results, ctx);
      break; // only one Eigenschaften per rem
    }
  }
  return results;
}

// =============================================================================
// Card Collection: Direct properties (DESCRIPTOR children)
// =============================================================================

// Collect cards from one direct property rem, and (if includeDescendants)
// from all rems that extend this property, recursively.
async function getCardsOfDirectProperty(
  plugin: RNPlugin, propRem: Rem, searchOptions: SearchOptions, ctx: CardCollectionContext
): Promise<SearchData[]> {
  if (ctx.excludedPropertyIds.has(propRem._id)) return [];
  if (ctx.processedRemIds.has(propRem._id)) return [];
  ctx.processedRemIds.add(propRem._id);

  const results: SearchData[] = [];

  // Direct properties are typically flashcards â€” collect their cards.
  if (await isFlashcard(plugin, propRem, ctx.cache)) {
    await collectFlashcardToCtx(plugin, propRem, results, ctx);
  }

  // Follow the extension chain: find all rems that extend this property via "extends".
  if (searchOptions.includeDescendants) {
    const referencingRems = await cRemsReferencingThis(propRem, ctx.cache);
    for (const ref of referencingRems) {
      const owner = await resolveExtendsOwner(plugin, ref, ctx.cache);
      if (!owner || owner._id === propRem._id) continue;
      // Only follow DESCRIPTOR owners â€” those are direct property extensions.
      // Non-DESCRIPTOR owners are class descendants, handled by getCardsOfDescendants.
      if ((await cGetType(owner, ctx.cache)) !== RemType.DESCRIPTOR) continue;
      if (ctx.excludedPropertyIds.has(owner._id)) continue;
      // owner was reached via remsReferencingThis → resolveExtendsOwner, so it is
      // by construction an extension of a seed property — no root-ancestor check needed.
      results.push(...await getCardsOfDirectProperty(plugin, owner, searchOptions, ctx));
    }
  }

  return results;
}

// Collect cards from all direct properties (non-reserved DESCRIPTOR children) of rem.
async function getCardsOfDirectProperties(
  plugin: RNPlugin, rem: Rem, searchOptions: SearchOptions, ctx: CardCollectionContext
): Promise<SearchData[]> {
  const children = await getCleanChildren(plugin, rem, ctx.cache);
  const results: SearchData[] = [];

  for (const child of children) {
    const type = await cGetType(child, ctx.cache);
    if (type !== RemType.DESCRIPTOR) continue;
    // Skip meta descriptors not already filtered by getCleanChildren ("eigenschaften", "implements")
    const name = await cGetRemText(plugin, child, ctx.cache);
    const baseName = name.includes(' > ') ? name.split(' > ').pop()!.trim() : name.trim();
    if (RESERVED_PROPERTY_KEYWORDS.includes(baseName.toLowerCase())) continue;
    if (ctx.excludedPropertyIds.has(child._id)) continue;
    // Skip properties whose type (root ancestor) is not in the known set — excludes new properties added by descendants
    if (ctx.includedPropertyRootIds !== null) {
      const root = await getPropertyRootAncestor(plugin, child, ctx.cache);
      if (!ctx.includedPropertyRootIds.has(root._id)) continue;
    }
    results.push(...await getCardsOfDirectProperty(plugin, child, searchOptions, ctx));
  }

  return results;
}

// =============================================================================
// Card Collection: Regular properties (DOCUMENT children)
// =============================================================================

// Collect cards from a single regular property rem, treating it as a full class:
// its own cards, its sub-properties, and its descendants are all collected.
// excludedPropertyIds is cleared for the recursive call — the UI checkboxes
// only govern the top-level selected rem's properties, not nested ones.
async function getCardsOfProperty(
  plugin: RNPlugin, propRem: Rem, searchOptions: SearchOptions, ctx: CardCollectionContext
): Promise<SearchData[]> {
  const propertyCtx: CardCollectionContext = {
    ...ctx,
    excludedPropertyIds: new Set(),
    // Once inside a known property, allow all its sub-properties freely.
    // The allowlist only gates which top-level properties to enter, not their internals.
    includedPropertyRootIds: null,
  };
  return getCardsOfRem(
    plugin,
    propRem,
    { ...searchOptions, includeThisRem: true, includeDescendants: true, includeAncestors: false },
    new Set(),
    propertyCtx
  );
}

// Collect cards from all regular properties (non-excluded DOCUMENT children) of rem.
async function getCardsOfProperties(
  plugin: RNPlugin, rem: Rem, searchOptions: SearchOptions, ctx: CardCollectionContext
): Promise<SearchData[]> {
  const children = await getCleanChildren(plugin, rem, ctx.cache);
  const results: SearchData[] = [];

  for (const child of children) {
    if (!await cIsDocument(child, ctx.cache)) continue;
    if (ctx.excludedPropertyIds.has(child._id)) continue;
    // Skip properties whose type (root ancestor) is not in the known set — excludes new properties added by descendants
    if (ctx.includedPropertyRootIds !== null) {
      const root = await getPropertyRootAncestor(plugin, child, ctx.cache);
      if (!ctx.includedPropertyRootIds.has(root._id)) continue;
    }
    results.push(...await getCardsOfProperty(plugin, child, searchOptions, ctx));
  }

  return results;
}

// =============================================================================
// Card Collection: Descendants
// =============================================================================

// Collect cards from all descendants of a class rem.
// Uses getCleanChildrenAll which returns the union of:
//   - structural children (C nested under B), and
//   - rems that extend this class via an "extends" descriptor (D extends B)
// This avoids the silent-drop bug of the old two-path approach where
// resolveExtendsOwner() returning undefined would cause extends-based
// descendants to be skipped entirely.
async function getCardsOfDescendants(
  plugin: RNPlugin, rem: Rem, searchOptions: SearchOptions, ctx: CardCollectionContext
): Promise<SearchData[]> {
  const results: SearchData[] = [];

  const allChildren = await getCleanChildrenAll(plugin, rem, ctx.cache);

  console.log(await cGetRemText(plugin, rem, ctx.cache) + " children " + allChildren.length)

  for (const child of allChildren) {
    const type = await cGetType(child, ctx.cache);
    if (type === RemType.DESCRIPTOR) continue; // direct properties - handled by getCardsOfDirectProperties
    if (await child.isDocument()) continue;     // regular properties - handled by getCardsOfProperties
    if (ctx.processedRemIds.has(child._id)) continue;
    results.push(...await getCardsOfRem(plugin, child, { ...searchOptions, includeThisRem: true }, ctx.excludedPropertyIds, ctx));
  }

  // Portals (raw children, not returned by getCleanChildrenAll)
  if (searchOptions.includePortals) {
    const rawChildren = await cGetChildrenRem(rem, ctx.cache);
    for (const child of rawChildren) {
      if ((await cGetType(child, ctx.cache)) !== RemType.PORTAL) continue;
      const portalRems = await child.getPortalDirectlyIncludedRem();
      for (const pr of portalRems) {
        const freshRem = await plugin.rem.findOne(pr._id);
        if (!freshRem || ctx.processedRemIds.has(freshRem._id)) continue;
        results.push(...await getCardsOfRem(plugin, freshRem, { ...searchOptions, includeThisRem: true }, ctx.excludedPropertyIds, ctx));
      }
    }
  }

  return results;
}

// =============================================================================
// Card Collection: Ancestors
// =============================================================================

// Collect cards from all ancestor class rems.
// Each ancestor is processed with includeDescendants=false and includeAncestors=false
// to avoid re-collecting the original rem's subtree, and includeThisRem=true so
// the ancestor's own Eigenschaften/properties are always included.
async function getCardsOfAncestors(
  plugin: RNPlugin, rem: Rem, searchOptions: SearchOptions, ctx: CardCollectionContext
): Promise<SearchData[]> {
  const results: SearchData[] = [];
  const lineages = await getAncestorLineage(plugin, rem, ctx.cache);

  const seenIds = new Set<string>([rem._id]);
  const ancestorOptions: SearchOptions = {
    ...searchOptions,
    includeThisRem: true,
    includeDescendants: false,
    includeAncestors: false,
  };

  for (const lineage of lineages) {
    for (const ancestor of lineage) {
      if (seenIds.has(ancestor._id) || ctx.processedRemIds.has(ancestor._id)) continue;
      seenIds.add(ancestor._id);
      results.push(...await getCardsOfRem(plugin, ancestor, ancestorOptions, ctx.excludedPropertyIds, ctx));
    }
  }

  return results;
}

// =============================================================================
// Card Collection: Orchestrator
// =============================================================================

// Collect all flashcards from a class rem according to search options and property exclusions.
//
// excludedPropertyIds: set of property rem IDs that are unchecked in the UI.
//   Both direct properties and regular properties are skipped when their ID is in this set.
//   For direct properties, the entire extension chain below the excluded property is also skipped.
//
// _ctx: internal â€” omit on top-level calls; passed through by recursive sub-functions.
async function getCardsOfRem(
  plugin: RNPlugin,
  rem: Rem,
  searchOptions: SearchOptions,
  excludedPropertyIds: Set<string> = new Set(),
  _ctx?: CardCollectionContext
): Promise<SearchData[]> {
  // Create shared context on the first (top-level) call; reuse on all recursive calls.
  let ctx: CardCollectionContext;
  if (_ctx) {
    ctx = _ctx;
  } else {
    const cache = createRemCache();
    ctx = {
      addedCardIds: new Set(),
      addedDisabledRemIds: new Set(),
      excludedPropertyIds,
      processedRemIds: new Set(),
      includedPropertyRootIds: searchOptions.excludeNewProperties
        ? (searchOptions.knownPropertyRootIds ?? null)
        : null,
      cache,
    };
  }

  // Cycle guard â€” each rem is processed at most once per top-level call.
  if (ctx.processedRemIds.has(rem._id)) return [];
  ctx.processedRemIds.add(rem._id);

  const results: SearchData[] = [];

  // THIS REM: Eigenschaften, direct properties, and regular properties.
  // Skipped entirely when includeThisRem is false (only descendants/ancestors collected).
  if (searchOptions.includeThisRem) {
    if (searchOptions.includeEigenschaften) {
      results.push(...await getCardsOfEigenschaften(plugin, rem, ctx));
    }
    results.push(...await getCardsOfDirectProperties(plugin, rem, searchOptions, ctx));
    results.push(...await getCardsOfProperties(plugin, rem, searchOptions, ctx));
  }

  // TAGGED REM: flashcards tagged with this rem
  if (searchOptions.includeTaggedRem) {
    const taggedRems = await cTaggedRem(rem, ctx.cache);
    for (const taggedRem of taggedRems) {
      if (await isFlashcard(plugin, taggedRem, ctx.cache)) {
        await collectFlashcardToCtx(plugin, taggedRem, results, ctx);
      }
    }
  }

  // DESCENDANTS
  if (searchOptions.includeDescendants) {
    results.push(...await getCardsOfDescendants(plugin, rem, searchOptions, ctx));
  }

  // ANCESTORS
  if (searchOptions.includeAncestors) {
    results.push(...await getCardsOfAncestors(plugin, rem, searchOptions, ctx));
  }

  // TODO: includeReferencedCard, includeReferencingCard, includeReferencedRem, includeReferencingRem
  // are not yet implemented in the new architecture.

  return results;
}

function getLastRatingStr(history: RepetitionStatus[] | undefined, count: number = 1): string[] {
    // Handle undefined or empty array
    if (!history || history.length === 0) {
        return [];
    }

    const result: string[] = [];

    // Iterate from the last element to the first
    for (let i = history.length - 1; i >= 0; i--) {
        const score = history[i].score;
        // Skip TOO_EARLY and VIEWED_AS_LEECH
        if (score !== QueueInteractionScore.TOO_EARLY && score !== QueueInteractionScore.VIEWED_AS_LEECH) {
            let ratingStr = "";
            switch (score) {
                case QueueInteractionScore.AGAIN:
                    ratingStr = "Forgot";
                    break;
                case QueueInteractionScore.HARD:
                    ratingStr = "Partially recalled";
                    break;
                case QueueInteractionScore.GOOD:
                    ratingStr = "Recalled with effort";
                    break;
                case QueueInteractionScore.EASY:
                    ratingStr = "Easily recalled";
                    break;
                case QueueInteractionScore.RESET:
                    ratingStr = "Reset";
                    break;
                default:
                    continue; // Skip unexpected scores
            }
            result.push(ratingStr);
            if (result.length === count) {
                break;
            }
        }
    }

    return result;
}

function getLastInterval(history: RepetitionStatus[] | undefined): {workingInterval: number, intervalSetOn: number} | undefined {
  if (!history || history.length === 0) {
      return undefined;
  }

  for (let i = history.length - 1; i >= 0; i--) {
      const repetition = history[i];
      if (repetition.pluginData && typeof repetition.pluginData.workingInterval === 'number' && typeof repetition.pluginData.intervalSetOn === 'number') {
          return { workingInterval: repetition.pluginData.workingInterval , intervalSetOn: repetition.pluginData.intervalSetOn};
      }
  }

  return undefined;
}

// Updated to return an array of { id, text, nextDate, interval, lastRating } objects
// Now works with SearchData[] to support both enabled and disabled flashcards
// Re-fetches cards from database to get fresh repetitionHistory
async function questionsFromSearchData(plugin: RNPlugin, searchData: SearchData[]): Promise<{ id: string, text: string, nextDate: number, interval: string, lastRatings: string[], isDisabled: boolean }[]> {
    const questions: { id: string, text: string, nextDate: number, interval: string, lastRatings: string[], isDisabled: boolean }[] = [];
    for (const sd of searchData) {
        const text = await getRemText(plugin, sd.rem);
        
        if (sd.card) {
            // Re-fetch card from database to get updated repetitionHistory
            const freshCard = await plugin.card.findOne(sd.card._id);
            const cardToUse = freshCard || sd.card;
            
            // Enabled flashcard with card
            const lastInterval = getLastInterval(cardToUse.repetitionHistory);
            const lastRatings = getLastRatingStr(cardToUse.repetitionHistory, 3);
            const interval = lastInterval ? formatMilliseconds(lastInterval.workingInterval) : '';
            questions.push({ 
                id: sd.rem._id, 
                text, 
                nextDate: lastInterval ? lastInterval.intervalSetOn + lastInterval.workingInterval : 0, 
                interval, 
                lastRatings,
                isDisabled: false
            });
        } else {
            // Disabled flashcard (no card)
            questions.push({ 
                id: sd.rem._id, 
                text, 
                nextDate: 0, 
                interval: 'Disabled', 
                lastRatings: [],
                isDisabled: true
            });
        }
    }
    return questions;
}

interface PropertyEntry {
  id: string;
  name: string;
  isDirect: boolean; // true = descriptor child, false = document child
  inheritedFrom?: string; // name of ancestor rem if inherited
}

const RESERVED_PROPERTY_KEYWORDS = ['extends', 'imports', 'implements', 'eigenschaften'];

async function getPropertiesOfRem(plugin: RNPlugin, rem: Rem): Promise<PropertyEntry[]> {
  // Use structural children only (getCleanChildren), NOT getCleanChildrenAll which includes rems
  // that reference/extend this rem and would show up as false properties.
  const children = await getCleanChildren(plugin, rem);
  const entries: PropertyEntry[] = [];
  for (const child of children) {
    const [type, name, isDoc] = await Promise.all([child.getType(), getRemText(plugin, child), child.isDocument()]);
    // getCleanChildren already filters specialNames/specialNameParts (including slot-qualified names).
    // Only need to skip domain-specific reserved keywords here.
    const baseName = name.includes(' > ') ? name.split(' > ').pop()!.trim() : name.trim();
    const baseNormalized = baseName.toLowerCase();
    if (type === RemType.DESCRIPTOR && RESERVED_PROPERTY_KEYWORDS.includes(baseNormalized)) continue;
    // Direct property: descriptor that is NOT a reserved keyword
    if (type === RemType.DESCRIPTOR) {
      entries.push({ id: child._id, name, isDirect: true });
      continue;
    }
    // Regular property: document child
    if (isDoc) {
      entries.push({ id: child._id, name, isDirect: false });
    }
    // Everything else (CONCEPT, PORTAL, etc.) is a descendant/child, not a property â€” skip
  }
  return entries;
}

function CustomQueueWidget() {
    const plugin = usePlugin();

    const [currentQueueRem, setCurrentQueueRem] = useState<Rem | undefined>(undefined);

    const [loading, setLoading] = useState<boolean>(false);
    const [cardIds, setCardIds] = useState<string[]>([]);
    const [searchDataList, setSearchDataList] = useState<SearchData[]>([]);
    const [currentQueueIndex, setCurrentQueueIndex] = useState<number>(0);
    const [currentCardId, setCurrentCardId] = useState<string | undefined>(undefined);
    const [currentCardText, setCurrentCardText] = useState<string>("");
    const [currentCardLastInterval, setCurrentCardLastInterval] = useState<string>("");
    const [currentCardLastPractice, setCurrentCardLastPractice] = useState<string>("");
    const [currentCardRepetitionTiming, setcurrentCardRepetitionTiming] = useState<number>(0);
    const [currentCardLastRating, setcurrentCardLastRating] = useState<string[]>([]);
    const [isTableExpanded, setIsTableExpanded] = useState<boolean>(false);
    const [queueRemText, setQueueRemText] = useState<string>("");
    const [buildQueueRemText, setBuildQueueRemText] = useState<string>("");
    const [isListExpanded, setIsListExpanded] = useState<boolean>(false);
    // Updated state type to array of objects with isDisabled flag
    const [cardsData, setCardsData] = useState<{ id: string, text: string, nextDate: number, interval: string, lastRatings: string[], isDisabled: boolean }[]>([]);
    const [isDisabledTableExpanded, setIsDisabledTableExpanded] = useState<boolean>(true);
    const [sortColumn, setSortColumn] = useState<'text' | 'nextDate' | 'interval' | 'lastRating'>('nextDate');
    const [sortAscending, setSortAscending] = useState<boolean>(true);

    const handleSort = (column: 'text' | 'nextDate' | 'interval' | 'lastRating') => {
      if (sortColumn === column) {
        setSortAscending(!sortAscending);
      } else {
        setSortColumn(column);
        setSortAscending(true);
      }
      setIsListExpanded(true);
    };

    const ratingOrder: Record<string, number> = {
      'Easily recalled': 4,
      'Recalled with effort': 3,
      'Partially recalled': 2,
      'Forgot': 1,
      'Reset': 0,
      '': -1,
    };

    const getSortedCardsData = () => {
      return [...cardsData].sort((a, b) => {
        let comparison = 0;
        switch (sortColumn) {
          case 'text':
            //comparison = a.text.localeCompare(b.text);
            comparison = a.text.localeCompare(b.text, undefined, { numeric: true })
            break;
          case 'nextDate':
            comparison = a.nextDate - b.nextDate;
            break;
          case 'interval':
            comparison = a.interval.localeCompare(b.interval);
            break;
          case 'lastRating':
            const ratingA = ratingOrder[a.lastRatings[0]] ?? -1;
            const ratingB = ratingOrder[b.lastRatings[0]] ?? -1;
            comparison = ratingA - ratingB;
            break;
        }
        return sortAscending ? comparison : -comparison;
      });
    };

    //
    const [isBuildQueueExpanded, setIsBuildQueueExpanded] = useState<boolean>(false);
    const [isBuildQueueAllowed, setIsBuildQueueAllowed] = useState<boolean>(false);
    const [remProperties, setRemProperties] = useState<PropertyEntry[]>([]);
    const [checkedPropertyIds, setCheckedPropertyIds] = useState<Set<string>>(new Set());
    const [searchOptions, setSearchOptions] = useState<SearchOptions>({ includeThisRem: true,
                                                                        includeAncestors: false,
                                                                        includeDescendants: true,
                                                                        dueOnly: false,
                                                                        disabledOnly: false,
                                                                        referencedOnly: false,
                                                                        ratingOnly: false,
                                                                        ratingFilter: QueueInteractionScore.AGAIN,
                                                                        includePortals: false,
                                                                        //invertedDirection: false,
                                                                        includeReferencedCard: false,
                                                                        includeReferencingCard: false,
                                                                        includeReferencedRem: false,
                                                                        includeReferencingRem: false,
                                                                        includeTaggedRem: true,
                                                                        includeEigenschaften: true,
                                                                        excludeNewProperties: false,
                                                                        maximumNumberOfCards: 1000});

    const [isQueueExpanded, setIsQueueExpanded] = useState<boolean>(true);
    const [activeTab, setActiveTab] = useState<'build' | 'queue'>('build');

    const buildQueueRem = useTracker(async (reactPlugin) => {
            return await reactPlugin.focus.getFocusedRem();
        }
    );

    // Init from storage
    useEffect(() => {
        const initFromStorage = async () => {
            const currentQueueRemId: string | undefined = await plugin.storage.getSynced("currentQueueRemId");
            // Load stored search data (array of {remId, cardId} pairs)
            const storedSearchData: { remId: string, cardId: string | null }[] = (await plugin.storage.getSynced("currentQueueSearchData")) || [];
            // Load stored queue index
            const storedIndex: number = (await plugin.storage.getSynced("currentQueueIndex")) || 0;
            
            if (currentQueueRemId && storedSearchData.length > 0) {
                const rem = await plugin.rem.findOne(currentQueueRemId);
                if (rem) {
                    setCurrentQueueRem(rem);
                    
                    // Reconstruct SearchData from stored IDs
                    const loadedSearchData: SearchData[] = [];
                    const enabledCardIds: string[] = [];
                    
                    for (const stored of storedSearchData) {
                        const storedRem = await plugin.rem.findOne(stored.remId);
                        if (storedRem) {
                            if (stored.cardId) {
                                const card = await plugin.card.findOne(stored.cardId);
                                if (card) {
                                    loadedSearchData.push({ rem: storedRem, card });
                                    enabledCardIds.push(stored.cardId);
                                }
                            } else {
                                loadedSearchData.push({ rem: storedRem, card: null });
                            }
                        }
                    }
                    
                    setSearchDataList(loadedSearchData);
                    setCardIds(enabledCardIds);
                    setCardsData(await questionsFromSearchData(plugin, loadedSearchData));
                    // Restore stored index (clamped to valid range)
                    const validIndex = Math.min(Math.max(0, storedIndex), Math.max(0, loadedSearchData.length - 1));
                    setCurrentQueueIndex(validIndex);
                    updateCardInfo();
                }
            }
        };
        initFromStorage();
    }, [plugin]);

    // Event handlers
    useEffect(() => {
        const handleQueueLoadCard = async (event: any) => {
            updateCardInfo(event.cardId);
        };
        plugin.event.addListener(AppEvents.QueueLoadCard, undefined, handleQueueLoadCard);
        return () => {
            plugin.event.removeListener(AppEvents.QueueLoadCard, undefined, handleQueueLoadCard);
        };
    }, [plugin]);

    useEffect(() => {
        const updateRemText = async () => {
          //setFocusedRem(currentRem);

          if (currentQueueRem) {
              const text = await getRemText(plugin, currentQueueRem);
              setQueueRemText(text);
          } else {
            setQueueRemText("");
          }
        };
        updateRemText();
    }, [currentQueueRem]); // focusedRem

    useEffect(() => {
      const updateBuildQueueRemText = async () => {

        if(buildQueueRem) {
          const txt = await getRemText(plugin, buildQueueRem);
          setBuildQueueRemText(txt);

          const type = await buildQueueRem.getType();
          if (type === RemType.PORTAL) {
            setIsBuildQueueAllowed(false);
            setRemProperties([]);
            setCheckedPropertyIds(new Set());
          } else if (type === RemType.DESCRIPTOR) {
            // Direct property selected — allow build queue (traverses the extension chain)
            setIsBuildQueueAllowed(true);
            setRemProperties([]);
            setCheckedPropertyIds(new Set());
          } else {
            const flashcard = await isFlashcard(plugin, buildQueueRem);
            const allowed = !flashcard;
            setIsBuildQueueAllowed(allowed);
            if (allowed) {
              // Collect own properties
              const ownProps = await getPropertiesOfRem(plugin, buildQueueRem);

              // Collect inherited properties from ancestor lineage
              const lineages = await getAncestorLineage(plugin, buildQueueRem);
              const seenAncestorIds = new Set<string>();
              seenAncestorIds.add(buildQueueRem._id);
              const inheritedProps: PropertyEntry[] = [];
              for (const lineage of lineages) {
                for (const ancestor of lineage) {
                  if (seenAncestorIds.has(ancestor._id)) continue;
                  seenAncestorIds.add(ancestor._id);
                  const ancestorName = await getRemText(plugin, ancestor);
                  const props = await getPropertiesOfRem(plugin, ancestor);
                  for (const p of props) {
                    inheritedProps.push({ ...p, inheritedFrom: ancestorName });
                  }
                }
              }

              // Merge: own first, then inherited; de-duplicate by id (own takes priority)
              const seenPropIds = new Set<string>(ownProps.map(p => p.id));
              const merged: PropertyEntry[] = [...ownProps];
              for (const p of inheritedProps) {
                if (!seenPropIds.has(p.id)) {
                  seenPropIds.add(p.id);
                  merged.push(p);
                }
              }

              // De-duplicate extends-overrides for document (regular) properties:
              // If a more-derived property extends an ancestor property, hide the ancestor.
              // This mirrors the logic in getProperties() from AbstractionAndInheritance/utils.
              const candidateMap = new Map<string, PropertyEntry>(merged.map(p => [p.id, p]));
              const referencedByOverride = new Set<string>();
              await Promise.all(
                merged.map(async (p) => {
                  try {
                    const rem = await plugin.rem.findOne(p.id);
                    if (!rem) return;
                    const parents = await getExtendsParents(plugin, rem);
                    for (const par of parents) {
                      if (candidateMap.has(par._id)) referencedByOverride.add(par._id);
                    }
                  } catch {}
                })
              );
              const finalMerged = merged
                .filter(p => !referencedByOverride.has(p.id))
                .sort((a, b) => {
                  if (a.isDirect !== b.isDirect) return a.isDirect ? -1 : 1;
                  return a.name.localeCompare(b.name);
                });

              setRemProperties(finalMerged);
              setCheckedPropertyIds(new Set(finalMerged.map(p => p.id)));
            } else {
              setRemProperties([]);
              setCheckedPropertyIds(new Set());
            }
          }
        } else {
          setBuildQueueRemText("No Rem Selected");
          setIsBuildQueueAllowed(false);
          setRemProperties([]);
          setCheckedPropertyIds(new Set());
        }
      };
      updateBuildQueueRemText();
    }, [buildQueueRem]);

    function shuffle<T>(array: T[]): T[] {
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
      }
      return array;
    }

    const loadRemQueue = async () => {
      //console.log(await getRemText(plugin, focusedRem));

      console.log(searchOptions);

      setCardIds([]);
      setSearchDataList([]);
      setCardsData([]);
      //setFocusedRem(undefined);
      setIsTableExpanded(false);
      //setLoading(true);
      const currentFocusedRem = buildQueueRem; // focusedRem; //await plugin.focus.getFocusedRem();
      if (currentFocusedRem) {
          const updateQueue = async () => {
              setLoading(true);
              const text = await getRemText(plugin, currentFocusedRem);
              setQueueRemText(text);

              //let fetchedCards: Card[] = [];
              let fetchedCards: SearchData[] = [];
              const remType = await currentFocusedRem.getType();

              // Helper: create a fresh CardCollectionContext for direct-property traversal.
              const makeDirectPropCtx = (): CardCollectionContext => ({
                addedCardIds: new Set(),
                addedDisabledRemIds: new Set(),
                excludedPropertyIds: new Set(),
                processedRemIds: new Set(),
                includedPropertyRootIds: null,
                cache: createRemCache(),
              });

              if (remType === RemType.DESCRIPTOR) {
                // Focused rem is a direct property — traverse its extension chain directly.
                fetchedCards = await getCardsOfDirectProperty(
                  plugin, currentFocusedRem, searchOptions, makeDirectPropCtx()
                );
              } else {
                // Normal class/document rem — use the full getCardsOfRem pipeline.
                // Compute exclusion set from unchecked properties in the UI,
                // expanded to include each excluded property's ancestors and descendants.
                const uncheckedIds = remProperties.filter(p => !checkedPropertyIds.has(p.id)).map(p => p.id);
                const excludedPropertyIds = new Set<string>(uncheckedIds);
                for (const id of uncheckedIds) {
                  const propRem = await plugin.rem.findOne(id);
                  if (!propRem) continue;
                  const [ancestorIds, descendantIds] = await Promise.all([
                    getAncestorIds(plugin, propRem),
                    getDescendantIds(plugin, propRem),
                  ]);
                  for (const aid of ancestorIds) excludedPropertyIds.add(aid);
                  for (const did of descendantIds) excludedPropertyIds.add(did);
                }

                // Pre-compute root ancestor IDs for all known properties of this rem.
                let knownPropertyRootIds: Set<string> | undefined;
                if (searchOptions.excludeNewProperties) {
                  knownPropertyRootIds = new Set<string>();
                  await Promise.all(remProperties.map(async (p) => {
                    const propRem = await plugin.rem.findOne(p.id);
                    if (!propRem) return;
                    const root = await getPropertyRootAncestor(plugin, propRem);
                    knownPropertyRootIds!.add(root._id);
                  }));
                }

                fetchedCards = await getCardsOfRem(
                  plugin, currentFocusedRem,
                  { ...searchOptions, knownPropertyRootIds },
                  excludedPropertyIds
                );
              }

              // Re-usable excluded set for post-filters (empty for DESCRIPTOR path)
              const excludedPropertyIds = remType === RemType.DESCRIPTOR ? new Set<string>() : (() => {
                // Already computed above in the else branch — but TypeScript needs it in scope.
                // Re-derive cheaply (unchecked only, no expansion needed for post-filter calls).
                const ids = new Set<string>(remProperties.filter(p => !checkedPropertyIds.has(p.id)).map(p => p.id));
                return ids;
              })();

              //console.log("fetchedCards: " + fetchedCards.length)

              // DUEONLY: Remove Cards that are not due, if dueOnly option is checked.
              if(searchOptions.dueOnly) {
                for (let i = fetchedCards.length - 1; i >= 0; i--) {
                  if(!isDue(fetchedCards[i])) {
                    fetchedCards.splice(i, 1);
                  }
                }
              }

              // REFERENCEDONLY: Remove Cards that are Non-Ref Cards, if referencedOnly option is checked.
              if(searchOptions.referencedOnly) {
                const baseOpts = {...searchOptions, referencedOnly: false, includeReferencedCard: false, includeReferencingCard: false, includeReferencedRem: false, includeReferencingRem: false, includeTaggedRem: false};
                const nonRefCards = remType === RemType.DESCRIPTOR
                  ? await getCardsOfDirectProperty(plugin, currentFocusedRem, baseOpts, makeDirectPropCtx())
                  : await getCardsOfRem(plugin, currentFocusedRem, baseOpts, excludedPropertyIds);
                
                // Create a Set of _ids from B for efficient lookup (filter out null cards)
                const bIds = new Set(nonRefCards.filter(card => card.card !== null).map(card => card.card!._id));

                // Iterate backward through A to safely remove elements
                for (let i = fetchedCards.length - 1; i >= 0; i--) {
                  if (fetchedCards[i].card && bIds.has(fetchedCards[i].card!._id)) {
                    fetchedCards.splice(i, 1); // Remove the card at index i if its _id is in B
                  }
                }
              }

              // RATINGONLY (skip disabled flashcards with null cards)
              if(searchOptions.ratingOnly) {
                for(let i = fetchedCards.length-1; i >= 0; i--) {
                  const card = fetchedCards[i].card;
                  if (!card) {
                    // Disabled flashcard has no card, skip rating filter
                    continue;
                  }
                  const rep = card.repetitionHistory;

                  if(!(rep && rep[rep.length-1] && rep[rep.length-1].score == searchOptions.ratingFilter)) {
                    fetchedCards.splice(i, 1);
                  }
                }
              }

              // DISABLEDONLY: 
              for (let i = fetchedCards.length - 1; i >= 0; i--) {
                //console.log(i + " " + await getRemText(plugin, fetchedCards[i].rem) + " isDisabled: " + await isDisabled(plugin, fetchedCards[i].rem));
                if(!(await isDisabled(plugin, fetchedCards[i].rem) == searchOptions.disabledOnly)) {
                  fetchedCards.splice(i, 1);
                } 
              }

              //
              fetchedCards = shuffle<SearchData>(fetchedCards);
              fetchedCards = searchOptions.maximumNumberOfCards != 0 ? fetchedCards.slice(0, searchOptions.maximumNumberOfCards) : fetchedCards;
              
              // Store the full searchDataList
              setSearchDataList(fetchedCards);
              
              // Extract card IDs for enabled cards only (for Queue component)
              const enabledCards = fetchedCards.filter(c => c.card !== null);
              const ids = enabledCards.map((c) => c.card!._id);
              setCardIds(ids);
              
              // Generate display data from all search data (including disabled)
              setCardsData(await questionsFromSearchData(plugin, fetchedCards));
              
              // Save to storage as serializable format
              const storableSearchData = fetchedCards.map(sd => ({
                  remId: sd.rem._id,
                  cardId: sd.card ? sd.card._id : null
              }));
              await plugin.storage.setSynced("currentQueueSearchData", storableSearchData);
              await plugin.storage.setSynced("currentQueueRemId", currentFocusedRem._id);
              // Reset queue index to 0 when building a new queue
              await plugin.storage.setSynced("currentQueueIndex", 0);
              setCurrentQueueIndex(0);
              setLoading(false);
              setCurrentQueueRem(currentFocusedRem);
              setIsTableExpanded(false);
              setIsBuildQueueExpanded(false);
          };
        updateQueue();
      }
    };

    const updateCardInfo = async (cardId = undefined) => {
        const id = cardId ?? await plugin.storage.getSynced<string>("currentQueueCardId");
        if (id) {
            setCurrentCardId(id);
            const currentCard = await plugin.card.findOne(id);
            const rem = await currentCard?.getRem();
            const lastInterval = getLastInterval(currentCard?.repetitionHistory);
            setCurrentCardLastInterval(lastInterval ? formatMilliseconds(lastInterval.workingInterval) : "");
            setCurrentCardLastPractice(lastInterval ? (formatMilliseconds(lastInterval.intervalSetOn - Date.now(), true) + " ago") : "");
            setcurrentCardRepetitionTiming(lastInterval ? lastInterval.intervalSetOn + lastInterval.workingInterval - Date.now() : 0);
            setcurrentCardLastRating(getLastRatingStr(currentCard?.repetitionHistory, 5));
        }
    };

    async function onMouseClick() {
        updateCardInfo();
    }

    // Handle queue index changes (e.g., when a card is answered)
    const handleCurrentIndexChange = async (newIndex: number) => {
        setCurrentQueueIndex(newIndex);
        await plugin.storage.setSynced("currentQueueIndex", newIndex);
    };

    // Handle card interaction (skip or rated)
    const handleCardInteraction = async (newOrder: SearchData[]) => {
        // Update local state with the new order
        setSearchDataList(newOrder);
        
        // Persist queue order to storage
        const storableSearchData = newOrder.map(sd => ({
            remId: sd.rem._id,
            cardId: sd.card ? sd.card._id : null
        }));
        await plugin.storage.setSynced("currentQueueSearchData", storableSearchData);
        
        // Refresh cardsData for table display
        setCardsData(await questionsFromSearchData(plugin, newOrder));
    };

    const openCurrentQueueRem = async () => {
        if (currentQueueRem) {
            await plugin.window.openRem(currentQueueRem);
        }
    };

    const exportQueueToXml = async () => {
        const sortedData = getSortedCardsData();
        
        let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
        xml += '<queue>\n';
        xml += `  <name>${escapeXml(queueRemText || 'Untitled Queue')}</name>\n`;
        xml += `  <exportDate>${new Date().toISOString()}</exportDate>\n`;
        xml += `  <totalCards>${sortedData.length}</totalCards>\n`;
        xml += '  <cards>\n';
        
        sortedData.forEach((card, index) => {
            xml += '    <card>\n';
            xml += `      <index>${index + 1}</index>\n`;
            xml += `      <id>${escapeXml(card.id)}</id>\n`;
            xml += `      <question>${escapeXml(card.text)}</question>\n`;
            xml += `      <nextDate>${new Date(card.nextDate).toISOString()}</nextDate>\n`;
            xml += `      <interval>${escapeXml(card.interval)}</interval>\n`;
            xml += '      <lastRatings>\n';
            card.lastRatings.forEach((rating) => {
                xml += `        <rating>${escapeXml(rating)}</rating>\n`;
            });
            xml += '      </lastRatings>\n';
            xml += '    </card>\n';
        });
        
        xml += '  </cards>\n';
        xml += '</queue>';
        
        try {
            // Try using the Clipboard API first
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(xml);
            } else {
                // Fallback: create a temporary textarea element
                const textArea = document.createElement('textarea');
                textArea.value = xml;
                textArea.style.position = 'fixed';
                textArea.style.left = '-9999px';
                textArea.style.top = '-9999px';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
            }
            await plugin.app.toast("XML copied to clipboard!");
        } catch (err) {
            console.error("Failed to copy to clipboard:", err);
            // Try the fallback method even if the first attempt failed
            try {
                const textArea = document.createElement('textarea');
                textArea.value = xml;
                textArea.style.position = 'fixed';
                textArea.style.left = '-9999px';
                textArea.style.top = '-9999px';
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                const success = document.execCommand('copy');
                document.body.removeChild(textArea);
                if (success) {
                    await plugin.app.toast("XML copied to clipboard!");
                } else {
                    await plugin.app.toast("Failed to copy to clipboard");
                }
            } catch (fallbackErr) {
                console.error("Fallback copy also failed:", fallbackErr);
                await plugin.app.toast("Failed to copy to clipboard");
            }
        }
    };

    const escapeXml = (str: string): string => {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
    };

    const openCurrentFlashcard = async () => {
        const currentSearchData = searchDataList.find((sd) => sd.card?._id === currentCardId);
        if (currentSearchData) {
            await plugin.window.openRem(currentSearchData.rem);
        }
    };

    const openRem = async (plugin: RNPlugin, id: string) => {
      const rem = await plugin.rem.findOne(id);

      if(rem)
        await plugin.window.openRem(rem);
    };

    const toogleBuildQueue = () => {
      setIsBuildQueueExpanded(!isBuildQueueExpanded);
      updateCardInfo();
    };

    const toggleTableExpansion = () => {
        setIsTableExpanded(!isTableExpanded);
        updateCardInfo();
    };

    const toogleCardList = () => {
        setIsListExpanded(!isListExpanded);
    };

    const toogleQueueExpansion = () => {
      setIsQueueExpanded(!isQueueExpanded);
    };

    const scoreToImage = new Map<string, string>([
      ["Skip", "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAzNiI+PHBhdGggZmlsbD0iI0ZGQ0M0RCIgZD0iTTIwIDYuMDQyYzAgMS4xMTItLjkwMyAyLjAxNC0yIDIuMDE0cy0yLS45MDItMi0yLjAxNFYyLjAxNEMxNiAuOTAxIDE2LjkwMyAwIDE4IDBzMiAuOTAxIDIgMi4wMTR2NC4wMjh6Ii8+PHBhdGggZmlsbD0iI0ZGQUMzMyIgZD0iTTkuMTggMzZjLS4yMjQgMC0uNDUyLS4wNTItLjY2Ni0uMTU5YTEuNTIxIDEuNTIxIDAgMCAxLS42NjctMi4wMjdsOC45NC0xOC4xMjdjLjI1Mi0uNTEyLjc2OC0uODM1IDEuMzMzLS44MzVzMS4wODEuMzIzIDEuMzMzLjgzNWw4Ljk0MSAxOC4xMjdhMS41MiAxLjUyIDAgMCAxLS42NjYgMi4wMjcgMS40ODIgMS40ODIgMCAwIDEtMS45OTktLjY3NkwxOC4xMjEgMTkuNzRsLTcuNjA3IDE1LjQyNUExLjQ5IDEuNDkgMCAwIDEgOS4xOCAzNnoiLz48cGF0aCBmaWxsPSIjNTg1OTVCIiBkPSJNMTguMTIxIDIwLjM5MmEuOTg1Ljk4NSAwIDAgMS0uNzAyLS4yOTVMMy41MTIgNS45OThjLS4zODgtLjM5NC0uMzg4LTEuMDMxIDAtMS40MjRzMS4wMTctLjM5MyAxLjQwNCAwTDE4LjEyMSAxNy45NiAzMS4zMjQgNC41NzNhLjk4NS45ODUgMCAwIDEgMS40MDUgMCAxLjAxNyAxLjAxNyAwIDAgMSAwIDEuNDI0bC0xMy45MDUgMTQuMWEuOTkyLjk5MiAwIDAgMS0uNzAzLjI5NXoiLz48cGF0aCBmaWxsPSIjREQyRTQ0IiBkPSJNMzQuMDE1IDE5LjM4NWMwIDguODk4LTcuMTE1IDE2LjExMS0xNS44OTQgMTYuMTExLTguNzc3IDAtMTUuODkzLTcuMjEzLTE1Ljg5My0xNi4xMTEgMC04LjkgNy4xMTYtMTYuMTEzIDE1Ljg5My0xNi4xMTMgOC43NzgtLjAwMSAxNS44OTQgNy4yMTMgMTUuODk0IDE2LjExM3oiLz48cGF0aCBmaWxsPSIjRTZFN0U4IiBkPSJNMzAuMDQxIDE5LjM4NWMwIDYuNjc0LTUuMzM1IDEyLjA4NC0xMS45MiAxMi4wODQtNi41ODMgMC0xMS45MTktNS40MS0xMS45MTktMTIuMDg0QzYuMjAyIDEyLjcxIDExLjUzOCA3LjMgMTguMTIxIDcuM2M2LjU4NS0uMDAxIDExLjkyIDUuNDEgMTEuOTIgMTIuMDg1eiIvPjxwYXRoIGZpbGw9IiNGRkNDNEQiIGQ9Ik0zMC4wNCAxLjI1N2E1Ljg5OSA1Ljg5OSAwIDAgMC00LjIxNCAxLjc3bDguNDI5IDguNTQ0QTYuMDY0IDYuMDY0IDAgMCAwIDM2IDcuMjk5YzAtMy4zMzYtMi42NjktNi4wNDItNS45Ni02LjA0MnptLTI0LjA4IDBhNS45IDUuOSAwIDAgMSA0LjIxNCAxLjc3bC04LjQyOSA4LjU0NEE2LjA2NCA2LjA2NCAwIDAgMSAwIDcuMjk5YzAtMy4zMzYgMi42NjgtNi4wNDIgNS45Ni02LjA0MnoiLz48cGF0aCBmaWxsPSIjNDE0MDQyIiBkPSJNMjMgMjBoLTVhMSAxIDAgMCAxLTEtMXYtOWExIDEgMCAwIDEgMiAwdjhoNGExIDEgMCAxIDEgMCAyeiIvPjwvc3ZnPg=="],
      ["Forgot", "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAzNiI+PHBhdGggZmlsbD0iI0REMkU0NCIgZD0iTTIxLjUzMyAxOC4wMDIgMzMuNzY4IDUuNzY4YTIuNSAyLjUgMCAwIDAtMy41MzUtMy41MzVMMTcuOTk4IDE0LjQ2NyA1Ljc2NCAyLjIzM2EyLjQ5OCAyLjQ5OCAwIDAgMC0zLjUzNSAwIDIuNDk4IDIuNDk4IDAgMCAwIDAgMy41MzVsMTIuMjM0IDEyLjIzNEwyLjIwMSAzMC4yNjVhMi40OTggMi40OTggMCAwIDAgMS43NjggNC4yNjdjLjY0IDAgMS4yOC0uMjQ0IDEuNzY4LS43MzJsMTIuMjYyLTEyLjI2MyAxMi4yMzQgMTIuMjM0YTIuNDkzIDIuNDkzIDAgMCAwIDEuNzY4LjczMiAyLjUgMi41IDAgMCAwIDEuNzY4LTQuMjY3TDIxLjUzMyAxOC4wMDJ6Ii8+PC9zdmc+"],
      ["Partially recalled", "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAzNiI+PHBhdGggZmlsbD0iI0ZGQ0M0RCIgZD0iTTM2IDE4YzAgOS45NDEtOC4wNTkgMTgtMTggMTgtOS45NCAwLTE4LTguMDU5LTE4LTE4QzAgOC4wNiA4LjA2IDAgMTggMGM5Ljk0MSAwIDE4IDguMDYgMTggMTgiLz48ZWxsaXBzZSBmaWxsPSIjNjY0NTAwIiBjeD0iMTIiIGN5PSIxMy41IiByeD0iMi41IiByeT0iMy41Ii8+PGVsbGlwc2UgZmlsbD0iIzY2NDUwMCIgY3g9IjI0IiBjeT0iMTMuNSIgcng9IjIuNSIgcnk9IjMuNSIvPjxwYXRoIGZpbGw9IiNGRkYiIGQ9Ik0yNSAyMWE0IDQgMCAwIDEgMCA4SDExYTQgNCAwIDAgMSAwLThoMTR6Ii8+PHBhdGggZmlsbD0iIzY2NDUwMCIgZD0iTTI1IDIwSDExYy0yLjc1NyAwLTUgMi4yNDMtNSA1czIuMjQzIDUgNSA1aDE0YzIuNzU3IDAgNS0yLjI0MyA1LTVzLTIuMjQzLTUtNS01em0wIDJhMi45OTcgMi45OTcgMCAwIDEgMi45NDkgMi41SDI0LjVWMjJoLjV6bS0xLjUgMHYyLjVoLTNWMjJoM3ptLTQgMHYyLjVoLTNWMjJoM3ptLTQgMHYyLjVoLTNWMjJoM3pNMTEgMjJoLjV2Mi41SDguMDUxQTIuOTk3IDIuOTk3IDAgMCAxIDExIDIyem0wIDZhMi45OTcgMi45OTcgMCAwIDEtMi45NDktMi41SDExLjVWMjhIMTF6bTEuNSAwdi0yLjVoM1YyOGgtM3ptNCAwdi0yLjVoM1YyOGgtM3ptNCAwdi0yLjVoM1YyOGgtM3ptNC41IDBoLS41di0yLjVoMy40NDlBMi45OTcgMi45OTcgMCAwIDEgMjUgMjh6Ii8+PC9zdmc+"],
      ["Recalled with effort", "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAzNiI+PHBhdGggZmlsbD0iI0ZGQ0M0RCIgZD0iTTM2IDE4YzAgOS45NDEtOC4wNTkgMTgtMTggMTgtOS45NCAwLTE4LTguMDU5LTE4LTE4QzAgOC4wNiA4LjA2IDAgMTggMGM5Ljk0MSAwIDE4IDguMDYgMTggMTgiLz48cGF0aCBmaWxsPSIjNjY0NTAwIiBkPSJNMjguNDU3IDE3Ljc5N2MtLjA2LS4xMzUtMS40OTktMy4yOTctNC40NTctMy4yOTctMi45NTcgMC00LjM5NyAzLjE2Mi00LjQ1NyAzLjI5N2EuNTAzLjUwMyAwIDAgMCAuNzU1LjYwNWMuMDEyLS4wMDkgMS4yNjItLjkwMiAzLjcwMi0uOTAyIDIuNDI2IDAgMy42NzQuODgxIDMuNzAyLjkwMWEuNDk4LjQ5OCAwIDAgMCAuNzU1LS42MDR6bS0xMiAwYy0uMDYtLjEzNS0xLjQ5OS0zLjI5Ny00LjQ1Ny0zLjI5Ny0yLjk1NyAwLTQuMzk3IDMuMTYyLTQuNDU3IDMuMjk3YS40OTkuNDk5IDAgMCAwIC43NTQuNjA1QzguMzEgMTguMzkzIDkuNTU5IDE3LjUgMTIgMTcuNWMyLjQyNiAwIDMuNjc0Ljg4MSAzLjcwMi45MDFhLjQ5OC40OTggMCAwIDAgLjc1NS0uNjA0ek0xOCAyMmMtMy42MjMgMC02LjAyNy0uNDIyLTktMS0uNjc5LS4xMzEtMiAwLTIgMiAwIDQgNC41OTUgOSAxMSA5IDYuNDA0IDAgMTEtNSAxMS05IDAtMi0xLjMyMS0yLjEzMi0yLTItMi45NzMuNTc4LTUuMzc3IDEtOSAxeiIvPjxwYXRoIGZpbGw9IiNGRkYiIGQ9Ik05IDIzczMgMSA5IDEgOS0xIDktMS0yIDQtOSA0LTktNC05LTR6Ii8+PC9zdmc+"],
      ["Easily recalled", "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNiAzNiI+PHBhdGggZmlsbD0iI0Y0OTAwQyIgZD0iTTE0LjE3NCAxNy4wNzUgNi43NSA3LjU5NGwtMy43MjIgOS40ODF6Ii8+PHBhdGggZmlsbD0iI0Y0OTAwQyIgZD0ibTE3LjkzOCA1LjUzNC02LjU2MyAxMi4zODlIMjQuNXoiLz48cGF0aCBmaWxsPSIjRjQ5MDBDIiBkPSJtMjEuODI2IDE3LjA3NSA3LjQyNC05LjQ4MSAzLjcyMiA5LjQ4MXoiLz48cGF0aCBmaWxsPSIjRkZDQzREIiBkPSJNMjguNjY5IDE1LjE5IDIzLjg4NyAzLjUyM2wtNS44OCAxMS42NjgtLjAwNy4wMDMtLjAwNy0uMDA0LTUuODgtMTEuNjY4TDcuMzMxIDE1LjE5QzQuMTk3IDEwLjgzMyAxLjI4IDguMDQyIDEuMjggOC4wNDJTMyAyMC43NSAzIDMzaDMwYzAtMTIuMjUgMS43Mi0yNC45NTggMS43Mi0yNC45NThzLTIuOTE3IDIuNzkxLTYuMDUxIDcuMTQ4eiIvPjxjaXJjbGUgZmlsbD0iIzVDOTEzQiIgY3g9IjE3Ljk1NyIgY3k9IjIyIiByPSIzLjY4OCIvPjxjaXJjbGUgZmlsbD0iIzk4MUNFQiIgY3g9IjI2LjQ2MyIgY3k9IjIyIiByPSIyLjQxMiIvPjxjaXJjbGUgZmlsbD0iI0REMkU0NCIgY3g9IjMyLjg1MiIgY3k9IjIyIiByPSIxLjk4NiIvPjxjaXJjbGUgZmlsbD0iIzk4MUNFQiIgY3g9IjkuNDUiIGN5PSIyMiIgcj0iMi40MTIiLz48Y2lyY2xlIGZpbGw9IiNERDJFNDQiIGN4PSIzLjA2MSIgY3k9IjIyIiByPSIxLjk4NiIvPjxwYXRoIGZpbGw9IiNGRkFDMzMiIGQ9Ik0zMyAzNEgzYTEgMSAwIDEgMSAwLTJoMzBhMSAxIDAgMSAxIDAgMnptMC0zLjQ4NkgzYTEgMSAwIDEgMSAwLTJoMzBhMSAxIDAgMSAxIDAgMnoiLz48Y2lyY2xlIGZpbGw9IiNGRkNDNEQiIGN4PSIxLjQ0NyIgY3k9IjguMDQyIiByPSIxLjQwNyIvPjxjaXJjbGUgZmlsbD0iI0Y0OTAwQyIgY3g9IjYuNzUiIGN5PSI3LjU5NCIgcj0iMS4xOTIiLz48Y2lyY2xlIGZpbGw9IiNGRkNDNEQiIGN4PSIxMi4xMTMiIGN5PSIzLjUyMyIgcj0iMS43ODQiLz48Y2lyY2xlIGZpbGw9IiNGRkNDNEQiIGN4PSIzNC41NTMiIGN5PSI4LjA0MiIgcj0iMS40MDciLz48Y2lyY2xlIGZpbGw9IiNGNDkwMEMiIGN4PSIyOS4yNSIgY3k9IjcuNTk0IiByPSIxLjE5MiIvPjxjaXJjbGUgZmlsbD0iI0ZGQ0M0RCIgY3g9IjIzLjg4NyIgY3k9IjMuNTIzIiByPSIxLjc4NCIvPjxjaXJjbGUgZmlsbD0iI0Y0OTAwQyIgY3g9IjE3LjkzOCIgY3k9IjUuNTM0IiByPSIxLjc4NCIvPjwvc3ZnPg=="]
    ]);

    return (
      <div style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", padding: 10, overflowY: "auto", minHeight: 0 }} >
        {/* Tab Header */}
        <div style={{ display: "flex", borderBottom: "2px solid #ddd", marginBottom: 10 }}>
          <button
            onClick={() => setActiveTab('build')}
            style={{
              padding: "10px 20px",
              border: "none",
              backgroundColor: activeTab === 'build' ? "#2b2c2c" : "transparent",
              cursor: "pointer",
              fontWeight: activeTab === 'build' ? "bold" : "normal",
              marginRight: 5,
              borderRadius: "4px 4px 0 0"
            }}
          >
            Build Queue
          </button>
          {cardsData.length > 0 && (
            <button
              onClick={() => setActiveTab('queue')}
              style={{
                padding: "10px 20px",
                border: "none",
                backgroundColor: activeTab === 'queue' ? "#2b2c2c" : "transparent",
                cursor: "pointer",
                fontWeight: activeTab === 'queue' ? "bold" : "normal",
                borderRadius: "4px 4px 0 0"
              }}
            >
              Queue ({cardsData.length})
            </button>
          )}
        </div>

        {/* Tab Content */}
        {activeTab === 'build' && (
          <div style={{ marginTop: "10px" }}>
            <div>Rem: {buildQueueRemText}</div>

                        {/* Eigenschaften + property filter toggles - always shown when a valid class rem is selected */}
            {isBuildQueueAllowed && (
              <div style={{ marginTop: "10px" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px" }}>
                  <input
                    type="checkbox"
                    checked={searchOptions.includeEigenschaften}
                    onChange={() => setSearchOptions({ ...searchOptions, includeEigenschaften: !searchOptions.includeEigenschaften })}
                  />
                  Eigenschaften
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", marginTop: "2px" }}>
                  <input
                    type="checkbox"
                    checked={searchOptions.excludeNewProperties}
                    onChange={() => setSearchOptions({ ...searchOptions, excludeNewProperties: !searchOptions.excludeNewProperties })}
                  />
                  Exclude new Properties
                </label>
              </div>
            )}
{/* Property list â€” only shown when a valid class rem is selected */}
            {isBuildQueueAllowed && remProperties.length > 0 && (
              <div style={{ marginTop: "10px" }}>
                <h3 style={{ marginBottom: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
                  <input
                    type="checkbox"
                    checked={remProperties.every(p => checkedPropertyIds.has(p.id))}
                    ref={(el) => {
                      if (el) el.indeterminate = remProperties.some(p => checkedPropertyIds.has(p.id)) && !remProperties.every(p => checkedPropertyIds.has(p.id));
                    }}
                    onChange={() => {
                      const allChecked = remProperties.every(p => checkedPropertyIds.has(p.id));
                      setCheckedPropertyIds(allChecked ? new Set() : new Set(remProperties.map(p => p.id)));
                    }}
                  />
                  Properties
                </h3>
                {remProperties.map((prop) => (
                  <label key={prop.id} style={{ display: "block", marginBottom: "2px", fontSize: "13px" }}>
                    <input
                      type="checkbox"
                      checked={checkedPropertyIds.has(prop.id)}
                      onChange={() => {
                        setCheckedPropertyIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(prop.id)) next.delete(prop.id);
                          else next.add(prop.id);
                          return next;
                        });
                      }}
                      style={{ marginRight: "5px" }}
                    />
                    {prop.name}
                    <span style={{ marginLeft: "6px", fontSize: "11px", opacity: 0.6, fontStyle: "italic" }}>
                      {prop.isDirect ? "direct" : "regular"}
                    </span>
                    {prop.inheritedFrom && (
                      <span style={{ marginLeft: "6px", fontSize: "11px", opacity: 0.5 }}>
                        [from {prop.inheritedFrom}]
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}
            
            {/* Hierarchy and Flashcard Filter side by side */}
            <div style={{ display: "flex", gap: "20px" }}>
              {/* Hierarchy group */}
              <div style={{ flex: 1 }}>
                <h3>Hierarchy</h3>
                <label style={{ display: "block" }} title='Include flashcards from the selected Rem itself.'>
                  <input 
                    type="checkbox" 
                    checked={searchOptions?.includeThisRem} 
                    onChange={(e) => setSearchOptions({ ...searchOptions, includeThisRem: !searchOptions.includeThisRem })} 
                    style={{ marginRight: '5px' }}
                  />
                  This Rem
                </label>
                <label style={{ display: "block" }} title='Include flashcards from ancestor Rems (and their first-level children, Properties/Eigenschaften, and documents).'>
                  <input 
                    type="checkbox" 
                    checked={searchOptions?.includeAncestors} 
                    onChange={(e) => setSearchOptions({ ...searchOptions, includeAncestors: !searchOptions.includeAncestors })} 
                    style={{ marginRight: '5px' }}
                  />
                  Ancestors
                </label>
                <label style={{ display: "block" }} title='Include flashcards from all descendant Rems.'>
                  <input 
                    type="checkbox" 
                    checked={searchOptions?.includeDescendants} 
                    onChange={(e) => setSearchOptions({ ...searchOptions, includeDescendants: !searchOptions.includeDescendants })} 
                    style={{ marginRight: '5px' }}
                  />
                  Descendants
                </label>
                <label style={{ display: "block" }} title='Include Flashcards from inside Portals.'>
                  <input 
                    type="checkbox" 
                    checked={searchOptions?.includePortals} 
                    onChange={(e) => setSearchOptions({ ...searchOptions, includePortals: !searchOptions.includePortals })} 
                    style={{ marginRight: '5px' }}
                  />
                  Include Portals
                </label>
              </div>
              
              {/* Card Properties group */}
              <div style={{ flex: 1 }}>
                <h3>Flashcard Filter</h3>
                <label style={{ display: "block" }} title='Only add Flashcards that are Due.'>
                  <input 
                    type="checkbox" 
                    checked={searchOptions?.dueOnly} 
                    onChange={(e) => setSearchOptions({ ...searchOptions, dueOnly: !searchOptions.dueOnly })} 
                    style={{ marginRight: '5px' }}
                  />
                  Due
                </label>
                <label style={{ display: "block" }} title='Only add Flashcards that are Disabled.'>
                  <input 
                    type="checkbox" 
                    checked={searchOptions?.disabledOnly} 
                    onChange={(e) => setSearchOptions({ ...searchOptions, disabledOnly: !searchOptions.disabledOnly })} 
                    style={{ marginRight: '5px' }}
                  />
                  Disabled
                </label>
                <label style={{ display: "block" }} title='Only add Flashcards that are a Reference.'>
                  <input 
                    type="checkbox" 
                    checked={searchOptions?.referencedOnly} 
                    onChange={(e) => setSearchOptions({ ...searchOptions, referencedOnly: !searchOptions.referencedOnly })} 
                    style={{ marginRight: '5px' }}
                  />
                  Referenced
                </label>
                <label style={{ display: "block" }} title='Only add Flashcards that were rated a particular way the last time'>
                  <input 
                    type="checkbox" 
                    checked={searchOptions?.ratingOnly} 
                    onChange={(e) => setSearchOptions({ ...searchOptions, ratingOnly: !searchOptions.ratingOnly })} 
                    style={{ marginRight: '5px' }}
                  />Last Rating: 
                    <input type="radio" name="Rating" id="Rating_0" value="Rating_0" onChange={(e) => setSearchOptions({...searchOptions, ratingFilter: QueueInteractionScore.TOO_EARLY})}/> <img style={{ width: '20px', height: '20px', }} src={scoreToImage.get("Skip")} />
                    <input type="radio" name="Rating" id="Rating_1" value="Rating_1" onChange={(e) => setSearchOptions({...searchOptions, ratingFilter: QueueInteractionScore.AGAIN})}/> <img style={{ width: '20px', height: '20px', }} src={scoreToImage.get("Forgot")} />
                    <input type="radio" name="Rating" id="Rating_2" value="Rating_2" onChange={(e) => setSearchOptions({...searchOptions, ratingFilter: QueueInteractionScore.HARD})}/> <img style={{ width: '20px', height: '20px', }} src={scoreToImage.get("Partially recalled")} />
                    <input type="radio" name="Rating" id="Rating_3" value="Rating_3" onChange={(e) => setSearchOptions({...searchOptions, ratingFilter: QueueInteractionScore.GOOD})}/> <img style={{ width: '20px', height: '20px', }} src={scoreToImage.get("Recalled with effort")} />
                    <input type="radio" name="Rating" id="Rating_4" value="Rating_4" onChange={(e) => setSearchOptions({...searchOptions, ratingFilter: QueueInteractionScore.EASY})}/> <img style={{ width: '20px', height: '20px', }} src={scoreToImage.get("Easily recalled")} />
                </label>
              </div>
            </div>
            
            {/* Include Flashcards and Include Rems side by side */}
            <div style={{ display: "flex", gap: "20px" }}>
              {/* Flashcards Referenced and Referencing group */}
              <div style={{ flex: 1 }}>
                <h3>Include References</h3>
                <label style={{ display: "block" }} title='Include Flashcards from Rems that are mentioned in Q/A'>
                  <input 
                    type="checkbox" 
                    checked={searchOptions?.includeReferencedRem} 
                    onChange={(e) => setSearchOptions({ ...searchOptions, includeReferencedRem: !searchOptions.includeReferencedRem })} 
                    style={{ marginRight: '5px' }}
                  />
                    All Flashcards of Rem referenced in Flashcards of Queue.
                </label>
                <label style={{ display: "block" }} title='Include Flashcards that are mentioned in Q/A'>
                  <input 
                    type="checkbox" 
                    checked={searchOptions?.includeReferencedCard} 
                    onChange={(e) => setSearchOptions({ ...searchOptions, includeReferencedCard: !searchOptions.includeReferencedCard })} 
                    style={{ marginRight: '5px' }}
                  />
                    Flashcard referenced in Flashcards of Queue.
                </label>
                <label style={{ display: "block" }} title='Include Flashcards that mention a Rem of the Queue.'>
                  <input 
                    type="checkbox" 
                    checked={searchOptions?.includeReferencingCard} 
                    onChange={(e) => setSearchOptions({ ...searchOptions, includeReferencingCard: !searchOptions.includeReferencingCard })} 
                    style={{ marginRight: '5px' }}
                  />
                    Flashcard that reference Rem of Queue.
                </label>
                <label style={{ display: "block" }} title='Include Flashcards that are tagged with this Rem.'>
                  <input 
                    type="checkbox" 
                    checked={searchOptions?.includeTaggedRem} 
                    onChange={(e) => setSearchOptions({ ...searchOptions, includeTaggedRem: !searchOptions.includeTaggedRem })} 
                    style={{ marginRight: '5px' }}
                  />
                    Flashcards tagged with this Rem.
                </label>
              </div>
            </div>
            <div>
              <h3>Other</h3>
              <label>
                Maximum Cards <input type='text' style={{ width: '30px' }} maxLength={4} value={searchOptions?.maximumNumberOfCards ?? ''} onChange={(e) => setSearchOptions({...searchOptions, maximumNumberOfCards: Number(e.target.value)})} /> 
              </label>
            </div>
            <div style={{ width: '100%', marginTop: '10px' }}>
            <MyRemNoteButton 
              text="Build Queue" 
              onClick={async () => {await loadRemQueue(); setActiveTab('queue');}} 
              img="M9 8h10M9 12h10M9 16h10M4.99 8H5m-.02 4h.01m0 4H5" 
              style={{ width: '100%', justifyContent: 'center' }}
              active={isBuildQueueAllowed}
            />
            </div>
          </div>
        )}

        {activeTab === 'queue' && (
          loading ? (
            <div>Loading flashcards...</div>
          ) : cardsData.length > 0 ? (
            <div style={{ flex: 1, minHeight: 0, maxHeight: "calc(100dvh - 140px)", overflowY: "auto" }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div onClick={onMouseClick} style={{ padding: "10px", position: "relative" }}>
                    <MyRemNoteQueue
                      cards={searchDataList}
                      width={"100%"}
                      maxWidth={"100%"}
                      onQueueComplete={() => console.log("Done!")}
                      onCardInteraction={handleCardInteraction}
                      initialIndex={currentQueueIndex}
                      onCurrentIndexChange={handleCurrentIndexChange}
                    />
                    {/* Disabled cards table - show when all cards in the queue are disabled */}
                    {cardsData.length > 0 && cardsData.every(c => c.isDisabled) && (
                      <div style={{ marginTop: "20px" }}>
                        <div 
                          onClick={() => setIsDisabledTableExpanded(!isDisabledTableExpanded)} 
                          style={{ cursor: "pointer", fontWeight: "bold", marginBottom: "10px", display: "flex", alignItems: "center", gap: "8px" }}
                        >
                          <span>{isDisabledTableExpanded ? 'â–¼' : 'â–º'}</span>
                          <span>Disabled Cards ({cardsData.length})</span>
                        </div>
                        {isDisabledTableExpanded && (
                          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "10px", tableLayout: "fixed", fontSize: "12px" }}>
                            <thead>
                              <tr>
                                <th style={{ border: "1px solid #ddd", padding: 8, textAlign: "left", width: "5%" }}>
                                  <MyRemNoteButtonSmall text="#" onClick={() => {}} />
                                </th>
                                <th style={{ border: "1px solid #ddd", padding: 8, textAlign: "left", width: "70%" }}>
                                  <MyRemNoteButtonSmall text={`Question ${sortColumn === 'text' ? (sortAscending ? 'â–²' : 'â–¼') : ''}`} onClick={() => handleSort('text')} />
                                </th>
                                <th style={{ border: "1px solid #ddd", padding: 8, textAlign: "left", width: "25%" }}>
                                  <MyRemNoteButtonSmall text="Status" onClick={() => {}} />
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {getSortedCardsData().map((c, index) => (
                                <tr key={c.id}>
                                  <td style={{ border: "1px solid #ddd", padding: 8, textAlign: "center" }}>
                                    {index + 1}
                                  </td>
                                  <td style={{ border: "1px solid #ddd", padding: 8 }}>
                                    <MyRemNoteButtonSmall text={c.text} onClick={async () => { openRem(plugin, c.id); }} />
                                  </td>
                                  <td style={{ border: "1px solid #ddd", padding: 8, textAlign: "center", color: "#888" }}>
                                    Disabled
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    )}
                </div>
              </div> 
            </div>
          ) : (
            <div style={{ padding: "20px", textAlign: "center" }}>No cards in queue. Go to "Build Queue" tab to create a queue.</div>
          )
        )}
      </div>
);

}

renderWidget(CustomQueueWidget);
