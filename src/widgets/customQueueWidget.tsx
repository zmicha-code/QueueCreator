import { PowerupSlotCodeMap, usePlugin, renderWidget, Queue, Rem, Card, RNPlugin, RemType, RichTextInterface, RepetitionStatus, QueueInteractionScore, EventCallbackFn, AppEvents, BuiltInPowerupCodes, useTracker, CardData
} from '@remnote/plugin-sdk';
import { useEffect, useState } from 'react';
// import MyRemNoteButton from '../components/MyRemNoteButton';
import MyRemNoteButton, { MyRemNoteButtonSmall } from '../components/MyRemnoteButton';
import { MyRemNoteQueue } from '../components/MyRemnoteQueue';

// -> AbstractionAndInheritance
export const specialNames = ["Collapse Tag Configure Options", "Hide Bullets", "Status", "query:", "query:#", "contains:", "Document", "Tags", "Rem With An Alias", "Highlight", "Tag", "Color", "Alias", "Aliases", "Bullet Icon"]; // , "Definition", "Eigenschaften"

export const specialNameParts = ["query:", "contains:"];

export async function getExtendsDescriptor(plugin: RNPlugin, rem: Rem): Promise<Rem | undefined> {
  try {
    const children = await rem.getChildrenRem();
    for (const child of children) {
      try {
        const [t, name] = await Promise.all([child.getType(), getRemText(plugin, child)]);
        if (t === RemType.DESCRIPTOR && name.trim().toLowerCase() === "extends") {
          return child;
        }
      } catch (_) {}
    }
  } catch (_) {}
  return undefined;
}

// Returns the parent Rems referenced under the "extends" descriptor child of `rem`.
export async function getExtendsParents(plugin: RNPlugin, rem: Rem): Promise<Rem[]> {
  const ext = await getExtendsDescriptor(plugin, rem);
  if (!ext) return [];
  const resultMap = new Map<string, Rem>();
  try {
    const extChildren = await ext.getChildrenRem();
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
async function getCleanChildren(plugin: RNPlugin, rem: Rem): Promise<Rem[]> {
  const childrenRems = await rem.getChildrenRem();
  const cleanChildren: Rem[] = [];

  for (const childRem of childrenRems) {
    const [text, type] = await Promise.all([
      getRemText(plugin, childRem),
      childRem.getType(),
    ]);
    const normalized = text.trim().toLowerCase();

    if (type === RemType.DESCRIPTOR && normalized === "extends") {
      continue;
    }

    if (!specialNames.includes(text)) {
      cleanChildren.push(childRem);
    }
  }

  return cleanChildren;
}

async function resolveExtendsOwner(
  plugin: RNPlugin,
  referencingRem: Rem
): Promise<Rem | undefined> {
  const visited = new Set<string>();
  let current: Rem | undefined = referencingRem;

  while (current) {
    if (visited.has(current._id)) {
      break;
    }
    visited.add(current._id);

    const type = await current.getType();
    const parent = await current.getParentRem();

    if (type === RemType.DESCRIPTOR) {
      const name = (await getRemText(plugin, current)).trim().toLowerCase();
      if (name === "extends") {
        return parent ?? undefined;
      }
    }

    current = parent ?? undefined;
  }

  return undefined;
}

// -> AbstractionAndInheritance
export async function getCleanChildrenAll(plugin: RNPlugin, rem: Rem): Promise<Rem[]> {
  const [childrenRems, referencingRems] = await Promise.all([
    rem.getChildrenRem(),
    rem.remsReferencingThis(),
  ]);

  const normalizedReferencing: Rem[] = [];
  for (const ref of referencingRems) {
    const owner = await resolveExtendsOwner(plugin, ref);
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
    Promise.all(uniqueRems.map((r) => getRemText(plugin, r))),
    Promise.all(uniqueRems.map((r) => r.getType())),
  ]);

  const cleanRems: Rem[] = [];
  for (let i = 0; i < uniqueRems.length; i++) {
    const text = texts[i];
    const type = types[i];
    const normalized = text.trim().toLowerCase();

    if (
      specialNames.includes(text) ||
      specialNameParts.some((part) => text.startsWith(part)) ||
      (type === RemType.DESCRIPTOR && normalized === "extends")
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
    const normalized = text.trim().toLowerCase();

    if (
      specialNames.includes(text) ||
      specialNameParts.some((part) => text.startsWith(part)) ||
      (type === RemType.DESCRIPTOR && normalized === "extends")
    ) {
      continue;
    }

    cleanRems.push(childrenRems[i]);
  }

  return cleanRems;
}

// -> AbstractionAndInheritance
export async function getAncestorLineage(plugin: RNPlugin, rem: Rem): Promise<Rem[][]> {
  const lineages = await findPaths(plugin, rem, [rem]);
  return lineages;
}

async function findPaths(plugin: RNPlugin, currentRem: Rem, currentPath: Rem[]): Promise<Rem[][]> {
  const parents = (await getParentClass(plugin, currentRem)) || [];

  if (parents.length === 1 && parents[0]._id === currentRem._id) {
    return [currentPath];
  } else {
    const allPaths: Rem[][] = [];
    for (const parent of parents) {
      if (!currentPath.some(r => r._id === parent._id)) {
        const parentPaths = await findPaths(plugin, parent, [...currentPath, parent]);
        allPaths.push(...parentPaths);
      }
    }
    return allPaths;
  }
}

export async function getParentClass(plugin: RNPlugin, rem: Rem): Promise<Rem[]> {
  if (!rem) return [];

  const [isDocument, directParent, extendsParents] = await Promise.all([
    rem.isDocument(),
    rem.getParentRem(),
    getExtendsParents(plugin, rem),
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

  // Pluralize unit if value isn’t 1
  const plural = value !== 1 ? 's' : '';
  //return `${value} ${unit}${plural}`;
  return (isNegative && !abs ? "-" : "") + value + " " + unit + plural;
}

async function isFlashcard(plugin: RNPlugin, rem: Rem): Promise <boolean> {

  if((await rem.getCards()).length > 0)
    return true;

  const children = await getCleanChildren(plugin, rem);

  for(const c of children) {
    if(await c.isCardItem())
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
  maximumNumberOfCards: number,
  useStructuralChildrenOnly: boolean // When true, only use structural children (not references)
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

async function getCardsOfRem( plugin: RNPlugin,
                              rem: Rem,
                              searchOptions: SearchOptions,
                              processed = new Set<string>(),
                              addedCardIds = new Set<string>(),
                              addedDisabledRemIds = new Set<string>(),
                              cardPath: string = "",
                              isInitialRem: boolean = true): Promise<SearchData[]> {
  // A Rem might appear as [[Rem]] in an answer (searchOptions.includeDescendants = false) and then later regulary (includeDescendants = true). 
  // Checking this would then prevent the full recursion because the Rem was already visited with lesser search depth
  if (processed.has(rem._id)) return [];

  if(searchOptions.includeDescendants)
    processed.add(rem._id);

  //console.log("GetCardsOfRem: " + await getRemText(plugin, rem));

  let cards: SearchData[] = [];

  // Use structural children only when specified (e.g., for ancestor traversal)
  let childrenRem = searchOptions.useStructuralChildrenOnly 
    ? await getCleanChildrenOnly(plugin, rem)
    : await getCleanChildrenAll(plugin, rem);

  const flashcard = await isFlashcard(plugin, rem);
  const disabled = await isDisabled(plugin, rem);
  
  // Only add flashcards from this rem if:
  // - This is not the initial rem, OR
  // - This is the initial rem AND includeThisRem is true
  const shouldAddThisRem = !isInitialRem || searchOptions.includeThisRem;
  
  // DISABLED FLASHCARD: Add disabled flashcards (no card object)
  if (flashcard && disabled && shouldAddThisRem) {
    await addDisabledFlashcard(plugin, rem, cards, addedDisabledRemIds, cardPath + "->" + await getRemText(plugin, rem));
  }
  
  // FLASHCARD: Add cards from this rem (only if not disabled)
  if (flashcard && !disabled && shouldAddThisRem) {
    await addFlashcard(plugin, rem, cards, searchOptions, addedCardIds, cardPath + "->" + await getRemText(plugin, rem));
  }
  
  // FLASHCARD:
  if(flashcard) {
    // FLASHCARD: Handle References that appear in this QUESTION
    const questionRefs = await rem.remsBeingReferenced();
    for(const r of questionRefs) {

      // References to Flashcard in Question
      if(searchOptions.includeReferencedCard) {
        // An answer to another Flashcard is referenced in the answer of this Flashcard
        if(await r.isCardItem()) {
          await addFlashcard(plugin, await r.getParentRem() as Rem, cards, searchOptions, addedCardIds, cardPath + "->" + await getRemText(plugin, rem));
        } else {
          // A Question of another Flashcard is referenced in the answer of this Flashcard
          await addFlashcard(plugin, r, cards, searchOptions, addedCardIds, cardPath + "->" + await getRemText(plugin, rem));
        }
      }

      if(searchOptions.includeReferencedRem) {
        cards = cards.concat(await getCardsOfRem( plugin,
                                                    r,
                                                    { ...searchOptions,
                                                      includeAncestors: false,
                                                      includeDescendants: false,
                                                      referencedOnly: false,
                                                      includeReferencedCard: false,
                                                      includeReferencedRem: false,
                                                      includeReferencingCard: false,
                                                      includeReferencingRem: false},
                                                    processed,
                                                    addedCardIds,
                                                    addedDisabledRemIds,
                                                    "->" + await getRemText(plugin, rem),
                                                    false));
        // If includeReferencedRem == true these should already be included?
        if(searchOptions.includeReferencedCard && !searchOptions.includeReferencedRem) {

          for(const ref of questionRefs) {
            await addFlashcard(plugin, ref, cards, searchOptions, addedCardIds, cardPath);
          }
        }
      }
    }
    
    // FLASHCARD: Handle References that appear in ANSWERS
    for(const c of childrenRem) {
      const answerRefs = await c.remsBeingReferenced();
      
      for(const r of answerRefs) {

        // References to Flashcard in Answers
        if(searchOptions.includeReferencedCard) {
          // An answer to another Flashcard is referenced in the answer of this Flashcard
          if(await r.isCardItem()) {
            await addFlashcard(plugin, await r.getParentRem() as Rem, cards, searchOptions, addedCardIds, cardPath + "->" + await getRemText(plugin, rem));
          } else {
            // A Question of another Flashcard is referenced in the answer of this Flashcard
            await addFlashcard(plugin, r, cards, searchOptions, addedCardIds, cardPath + "->" + await getRemText(plugin, rem));
          }
        }
        
        // References to Rem
        if(searchOptions.includeReferencedRem) {
          cards = cards.concat(await getCardsOfRem( plugin,
                                                    r,
                                                    { ...searchOptions,
                                                      includeAncestors: false,
                                                      includeDescendants: true,
                                                      referencedOnly: false,
                                                      includeReferencedCard: false,
                                                      includeReferencedRem: false,
                                                      includeReferencingCard: false,
                                                      includeReferencingRem: false},
                                                    processed,
                                                    addedCardIds,
                                                    addedDisabledRemIds,
                                                    "->" + await getRemText(plugin, rem),
                                                    false));
        }
      }

      // If includeReferencedRem == true these should already be included?
      //if(searchOptions.includeReferencedCard && !searchOptions.includeReferencedRem) {
        //for(const ref of answerRefs) {
        //  await addCards(plugin, ref, cards, searchOptions, addedCardIds, cardPath + "->" + await getRemText(plugin, rem));
        //}
      //} 
    }
  }

  // REM: This Rem is referenced in a FLASHCARD (e.g., questions where this rem appears as an answer)
  if(searchOptions.includeReferencingCard) {
    const childrenRef = await rem.remsReferencingThis();
    for (const ref of childrenRef) {
      // QUESTION:
      if(await isFlashcard(plugin, ref)) {
        await addFlashcard(plugin, ref, cards, searchOptions, addedCardIds, cardPath + "->" + await getRemText(plugin, rem));
      }

      // ANSWER: Reference appears in ANSWER
      if (await ref.isCardItem() || await ref.hasPowerup(BuiltInPowerupCodes.ExtraCardDetail)) {
        const question = await ref.getParentRem();
        if (question) {
          await addFlashcard(plugin, question, cards, searchOptions, addedCardIds, cardPath + "->" + await getRemText(plugin, rem));
        }
      }
    }
  }

  // HIERARCHY: Handle portals if includePortals is true
  if (searchOptions.includePortals) {
    //const childrenRem = await getCleanChildren(plugin, rem);

    for (const child of childrenRem) {
      if (await child.getType() === RemType.PORTAL) {
          const rems = await child.getPortalDirectlyIncludedRem();

          //console.log("In Portal:");
          for(const r of rems) {
            //console.log(await getRemText(plugin, r))
            // Using r instead of await plugin.rem.findOne(r._id) throws a runtime error
            cards = cards.concat(await getCardsOfRem( plugin,
                                                      await plugin.rem.findOne(r._id) as Rem,
                                                      searchOptions,
                                                      processed,
                                                      addedCardIds,
                                                      addedDisabledRemIds,
                                                      "->" + await getRemText(plugin, rem),
                                                      false)); // { ...searchOptions, invertedDirection: false }
          }
      }
    }
  }

  // HIERARCHY: Add option to include this.
  if (searchOptions.includeAncestors) {
    // Special Case: if current rem is a flashcard, also process its direct parent
    if(flashcard) {
      const parentRem = await rem.getParentRem();
      if (parentRem) {
        const ancestorCards = await getCardsOfRem(plugin,
                                                  parentRem,
                                                  {...searchOptions, includeDescendants: false},
                                                  processed,
                                                  addedCardIds,
                                                  addedDisabledRemIds,
                                                  "->" + await getRemText(plugin, rem),
                                                  false);
        cards = cards.concat(ancestorCards);
      }
    }

    const lineages = await getAncestorLineage(plugin, rem);

    // Build a set of all ancestor IDs to know which documents are in the lineage
    const ancestorIds = new Set<string>();
    for (const lineage of lineages) {
      for (const ancestor of lineage) {
        ancestorIds.add(ancestor._id);
      }
    }

    for (const lineage of lineages) {
      for (const ancestor of lineage) {
        // Skip if this is the current rem itself
        if (ancestor._id === rem._id) continue;
        
        //console.log("Go to Ancestor: " + await getRemText(plugin, ancestor));
        
        // 1. Check the ancestor rem itself for flashcards (no descendants)
        const ancestorCards = await getCardsOfRem(plugin,
                                                  ancestor,
                                                  { ...searchOptions, includeAncestors: false, includeDescendants: false },
                                                  processed,
                                                  addedCardIds,
                                                  addedDisabledRemIds,
                                                  "->" + await getRemText(plugin, rem),
                                                  false);
        cards = cards.concat(ancestorCards);
        
        // 2. Check first-level children of ancestor for flashcards (structural children only, no references)
        //    For "Properties"/"Eigenschaften" children, recurse fully
        //    For document children, only recurse if they are in the ancestor lineage
        const ancestorChildren = await getCleanChildrenOnly(plugin, ancestor);
        for (const ancestorChild of ancestorChildren) {
          // Skip if already processed or if this is the initial rem itself
          if (processed.has(ancestorChild._id) || ancestorChild._id === rem._id) continue;
          
          const childName = await getRemText(plugin, ancestorChild);
          const isDocument = await ancestorChild.isDocument();
          
          if (childName === "Properties" || childName === "Eigenschaften") {
            // Fully recurse into Properties/Eigenschaften (structural only)
            const propsCards = await getCardsOfRem(plugin,
                                                   ancestorChild,
                                                   { ...searchOptions, includeAncestors: false, includeDescendants: true, useStructuralChildrenOnly: true },
                                                   processed,
                                                   addedCardIds,
                                                   addedDisabledRemIds,
                                                   "->" + await getRemText(plugin, ancestor),
                                                   false);
            cards = cards.concat(propsCards);
          } else if (isDocument && ancestorIds.has(ancestorChild._id)) {
            // Only recurse into document children if they are in the ancestor lineage
            const propsCards = await getCardsOfRem(plugin,
                                                   ancestorChild,
                                                   { ...searchOptions, includeAncestors: false, includeDescendants: true, useStructuralChildrenOnly: true },
                                                   processed,
                                                   addedCardIds,
                                                   addedDisabledRemIds,
                                                   "->" + await getRemText(plugin, ancestor),
                                                   false);
            cards = cards.concat(propsCards);
          } else if (!isDocument) {
            // Only check non-document first-level children for flashcards (no further recursion)
            const childCards = await getCardsOfRem(plugin,
                                                   ancestorChild,
                                                   { ...searchOptions, includeAncestors: false, includeDescendants: false },
                                                   processed,
                                                   addedCardIds,
                                                   addedDisabledRemIds,
                                                   "->" + await getRemText(plugin, ancestor),
                                                   false);
            cards = cards.concat(childCards);
          }
          // If isDocument but NOT in ancestorIds, skip it entirely (e.g., RemB in the example)
        }
      }
    }
  }

  // HIERARCHY: Recurse into descendants and referencing rems
  for(const child of childrenRem) {

    // Properties
    const cName = await getRemText(plugin, child);

    // Only process Properties/Eigenschaften folder if:
    // - includeThisRem is true AND this is the initial rem (we want this rem's properties), OR
    // - includeDescendants is true (descendants includes everything), OR
    // - this is not the initial rem (we're inside a recursive call, so process descendant's properties)
    if((cName == "Properties" || cName == "Eigenschaften") && 
       ((searchOptions.includeThisRem && isInitialRem) || searchOptions.includeDescendants || !isInitialRem)) {
      cards = cards.concat(await getCardsOfRem( plugin,
                                                child,
                                                {...searchOptions, includeAncestors: false, includeDescendants: true},
                                                processed,
                                                addedCardIds,
                                                addedDisabledRemIds,
                                                "->" + await getRemText(plugin, rem),
                                                false)); // { ...searchOptions, invertedDirection: false }
    }

    // Skip Properties/Eigenschaften here - they are handled above with special logic
    if(searchOptions.includeDescendants && cName !== "Properties" && cName !== "Eigenschaften") { 
      //console.log("Goto Child: " + await getRemText(plugin, child))
      cards = cards.concat(await getCardsOfRem( plugin,
                                                child,
                                                searchOptions,
                                                processed,
                                                addedCardIds,
                                                addedDisabledRemIds,
                                                "->" + await getRemText(plugin, rem),
                                                false));
    }
  }

  // When "This Rem" is selected but not "Descendants", check first-level STRUCTURAL children
  // - If a child is a flashcard, include it (no recursion)
  // - If a child is a document (property of this rem), recurse into it using structural children only
  if (isInitialRem && searchOptions.includeThisRem && !searchOptions.includeDescendants) {
    const structuralChildren = await getCleanChildrenOnly(plugin, rem);
    for (const structChild of structuralChildren) {
      const childName = await getRemText(plugin, structChild);
      // Skip Properties/Eigenschaften as they are already handled in the main loop
      if (childName !== "Properties" && childName !== "Eigenschaften") {
        const isChildDocument = await structChild.isDocument();
        
        if (isChildDocument) {
          // Child is a document (property) - recurse into it with structural children only
          cards = cards.concat(await getCardsOfRem( plugin,
                                                    structChild,
                                                    {...searchOptions, includeAncestors: false, includeDescendants: true, useStructuralChildrenOnly: true},
                                                    processed,
                                                    addedCardIds,
                                                    addedDisabledRemIds,
                                                    "->" + await getRemText(plugin, rem),
                                                    false));
        } else if (await isFlashcard(plugin, structChild)) {
          // Child is a flashcard - include it directly (no recursion)
          const childCards = await structChild.getCards();
          for (const card of childCards) {
            if (!addedCardIds.has(card._id)) {
              addedCardIds.add(card._id);
              cards.push({rem: structChild, card: card});
            }
          }
        }
      }
    }
  }

  return cards;
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
async function questionsFromSearchData(plugin: RNPlugin, searchData: SearchData[]): Promise<{ id: string, text: string, nextDate: number, interval: string, lastRatings: string[], isDisabled: boolean }[]> {
    const questions: { id: string, text: string, nextDate: number, interval: string, lastRatings: string[], isDisabled: boolean }[] = [];
    for (const sd of searchData) {
        const text = await getRemText(plugin, sd.rem);
        
        if (sd.card) {
            // Enabled flashcard with card
            const lastInterval = getLastInterval(sd.card.repetitionHistory);
            const lastRatings = getLastRatingStr(sd.card.repetitionHistory, 3);
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

function CustomQueueWidget() {
    const plugin = usePlugin();

    const [currentQueueRem, setCurrentQueueRem] = useState<Rem | undefined>(undefined);

    const [loading, setLoading] = useState<boolean>(false);
    const [cardIds, setCardIds] = useState<string[]>([]);
    const [searchDataList, setSearchDataList] = useState<SearchData[]>([]);
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
    const [searchOptions, setSearchOptions] = useState<SearchOptions>({ includeThisRem: true,
                                                                        includeAncestors: false,
                                                                        includeDescendants: false,
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
                                                                        maximumNumberOfCards: 1000,
                                                                        useStructuralChildrenOnly: false});

    const [isQueueExpanded, setIsQueueExpanded] = useState<boolean>(true);

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
        } else {
          setBuildQueueRemText("No Rem Selected");
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
              fetchedCards = await getCardsOfRem(plugin, currentFocusedRem, searchOptions);

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
                const nonRefCards = await getCardsOfRem(plugin, currentFocusedRem, {...searchOptions, 
                                                                                    referencedOnly: false,
                                                                                    includeReferencedCard: false,
                                                                                    includeReferencingCard: false,
                                                                                    includeReferencedRem: false,
                                                                                    includeReferencingRem: false});
                
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
      <div style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column", padding: 10, overflowY: "auto" }} >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, }}>
          <div style={{ width: "100%", maxHeight: "600px", padding: "10px", border: "1px solid #ddd", marginRight: "20px" }}>
            <button style={{ width: "100%" }} onClick={toogleBuildQueue}>{isBuildQueueExpanded ? "- Build Queue" : "+ Build Queue"}</button>
            {isBuildQueueExpanded && (
              <div style={{ marginTop: "10px" }}>
                <div>Rem: {buildQueueRemText}</div>
                
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
                      /> 
                      This Rem
                    </label>
                    <label style={{ display: "block" }} title='Include flashcards from ancestor Rems (and their first-level children, Properties/Eigenschaften, and documents).'>
                      <input 
                        type="checkbox" 
                        checked={searchOptions?.includeAncestors} 
                        onChange={(e) => setSearchOptions({ ...searchOptions, includeAncestors: !searchOptions.includeAncestors })} 
                      /> 
                      Ancestors
                    </label>
                    <label style={{ display: "block" }} title='Include flashcards from all descendant Rems.'>
                      <input 
                        type="checkbox" 
                        checked={searchOptions?.includeDescendants} 
                        onChange={(e) => setSearchOptions({ ...searchOptions, includeDescendants: !searchOptions.includeDescendants })} 
                      /> 
                      Descendants
                    </label>
                    <label style={{ display: "block" }} title='Include Flashcards from inside Portals.'>
                      <input 
                        type="checkbox" 
                        checked={searchOptions?.includePortals} 
                        onChange={(e) => setSearchOptions({ ...searchOptions, includePortals: !searchOptions.includePortals })} 
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
                      /> 
                      Due
                    </label>
                    <label style={{ display: "block" }} title='Only add Flashcards that are Disabled.'>
                      <input 
                        type="checkbox" 
                        checked={searchOptions?.disabledOnly} 
                        onChange={(e) => setSearchOptions({ ...searchOptions, disabledOnly: !searchOptions.disabledOnly })} 
                      /> 
                      Disabled
                    </label>
                    <label style={{ display: "block" }} title='Only add Flashcards that are a Reference.'>
                      <input 
                        type="checkbox" 
                        checked={searchOptions?.referencedOnly} 
                        onChange={(e) => setSearchOptions({ ...searchOptions, referencedOnly: !searchOptions.referencedOnly })} 
                      /> 
                      Referenced
                    </label>
                    <label style={{ display: "block" }} title='Only add Flashcards that were rated a particular way the last time'>
                      <input 
                        type="checkbox" 
                        checked={searchOptions?.ratingOnly} 
                        onChange={(e) => setSearchOptions({ ...searchOptions, ratingOnly: !searchOptions.ratingOnly })} 
                      /> 
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
                    <h3>Include Flashcards</h3>
                    <label style={{ display: "block" }} title='Include Flashcards that are mentioned in Q/A'>
                      <input 
                        type="checkbox" 
                        checked={searchOptions?.includeReferencedCard} 
                        onChange={(e) => setSearchOptions({ ...searchOptions, includeReferencedCard: !searchOptions.includeReferencedCard })} 
                      /> 
                       Flashcards referenced in Q or A.
                    </label>
                    <label style={{ display: "block" }} title='Include Flashcards that mention a Rem of the Queue.'>
                      <input 
                        type="checkbox" 
                        checked={searchOptions?.includeReferencingCard} 
                        onChange={(e) => setSearchOptions({ ...searchOptions, includeReferencingCard: !searchOptions.includeReferencingCard })} 
                      /> 
                       Other Flashcards that reference Rem in Q or A
                    </label>
                    
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3>Include Rems</h3>
                    <label style={{ display: "block" }} title='Include Flashcards from Rems that are mentioned in Q/A'>
                      <input 
                        type="checkbox" 
                        checked={searchOptions?.includeReferencedRem} 
                        onChange={(e) => setSearchOptions({ ...searchOptions, includeReferencedRem: !searchOptions.includeReferencedRem })} 
                      /> 
                       Rems referenced in Q or A.
                    </label>
                  </div>
                </div>
                <div>
                <label>
                  Maximum Cards <input type='text' style={{ width: '30px' }} maxLength={4} value={searchOptions?.maximumNumberOfCards ?? ''} onChange={(e) => setSearchOptions({...searchOptions, maximumNumberOfCards: Number(e.target.value)})} /> 
                </label>
                </div>
                <div style={{ width: '100%', marginTop: '10px' }}>
                <MyRemNoteButton 
                  text="Build Queue" 
                  onClick={async () => {await loadRemQueue()}} 
                  img="M9 8h10M9 12h10M9 16h10M4.99 8H5m-.02 4h.01m0 4H5" 
                  style={{ width: '100%', justifyContent: 'center' }}
                />
                </div>
              </div>
            )}
          </div>
        </div>
        {loading ? (
          <div>Loading flashcards...</div>
        ) : cardsData.length > 0 ? (
          <div style={{ height: "100%"}}>
          <div style={{ display: "flex", flexDirection: "column", }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, }}>
              <div style={{ width: "100%", maxHeight: "600px", overflowY: "scroll", padding: "10px", border: "1px solid #ddd", marginRight: "20px" }}>
                <button style={{ width: "100%" }} onClick={toogleCardList}>{isListExpanded ? "- Current Queue" : "+ Current Queue"} ({cardsData.length})</button>
                {isListExpanded && (
                  <div style={{ marginTop: "10px" }}>
                    <div style={{ display: "flex", gap: "10px", marginBottom: "10px" }}>
                      <MyRemNoteButton text={queueRemText ? queueRemText : "No Rem selected"} onClick={openCurrentQueueRem} img="M9 7V2.221a2 2 0 0 0-.5.365L4.586 6.5a2 2 0 0 0-.365.5H9Zm2 0V2h7a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-5h7.586l-.293.293a1 1 0 0 0 1.414 1.414l2-2a1 1 0 0 0 0-1.414l-2-2a1 1 0 0 0-1.414 1.414l.293.293H4V9h5a2 2 0 0 0 2-2Z" />
                      <MyRemNoteButton text="Export Queue" onClick={exportQueueToXml} img="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3" />
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "10px", tableLayout: "fixed", fontSize: "12px" }}>
                      <thead>
                        <tr>
                          <th style={{ border: "1px solid #ddd", padding: 8, textAlign: "left", width: "60%" }}><MyRemNoteButtonSmall text={`Question ${sortColumn === 'text' ? (sortAscending ? '▲' : '▼') : ''}`} onClick={() => handleSort('text')} /></th>
                          <th style={{ border: "1px solid #ddd", padding: 8, textAlign: "left", width: "15%" }}><MyRemNoteButtonSmall text={`Next Date ${sortColumn === 'nextDate' ? (sortAscending ? '▲' : '▼') : ''}`} onClick={() => handleSort('nextDate')} /></th>
                          <th style={{ border: "1px solid #ddd", padding: 8, textAlign: "left", width: "15%" }}><MyRemNoteButtonSmall text={`Interval ${sortColumn === 'interval' ? (sortAscending ? '▲' : '▼') : ''}`} onClick={() => handleSort('interval')} /></th>
                          <th style={{ border: "1px solid #ddd", padding: 8, textAlign: "left", width: "10%" }}><MyRemNoteButtonSmall text={`Last Rating ${sortColumn === 'lastRating' ? (sortAscending ? '▲' : '▼') : ''}`} onClick={() => handleSort('lastRating')} /></th>
                        </tr>
                      </thead>
                      <tbody>
                        {getSortedCardsData().map((c) => (
                          <tr key={c.id}>
                            <td style={{ border: "1px solid #ddd", padding: 8 }}><MyRemNoteButtonSmall text={c.text} onClick={async () => { openRem(plugin, c.id); }} /></td>
                            <td style={{ border: "1px solid #ddd", padding: 8 }}>{formatMilliseconds(c.nextDate - Date.now())}</td>
                            <td style={{ border: "1px solid #ddd", padding: 8 }}>{c.interval}</td>
                            <td style={{ border: "1px solid #ddd", padding: 8, textAlign: "center" }}>
                              {c.lastRatings.length > 0 && (
                                c.lastRatings.slice().reverse().map((rating, index) => (
                                  <img
                                    key={index}
                                    style={{ width: '16px', height: '16px', marginRight: index < c.lastRatings.length - 1 ? '3px' : '0' }}
                                    src={scoreToImage.get(rating)}
                                  />
                                ))
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
            <div onClick={onMouseClick} style={{ height: "100%", maxHeight: "100%", overflowY: "auto", padding: "10px", border: "1px solid #ddd", marginRight: "20px", position: "relative" }}>
                {/*<Queue
                  cardIds={cardIds}
                  width={"100%"}
                  maxWidth={"100%"}
                />*/}
                <MyRemNoteQueue
                  cards={searchDataList}
                  width={"100%"}
                  maxWidth={"100%"}
                  onQueueComplete={() => console.log("Done!")}
                />
            </div>
          </div> 
          </div>
        ) : (
        <div>No cards to display. cardsData is empty: {JSON.stringify(cardsData)}</div>
        )}
      </div>
);

}

renderWidget(CustomQueueWidget);