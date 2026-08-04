import { RNPlugin, Rem, RemType, RichTextInterface } from '@remnote/plugin-sdk';
import { getExtendsParents, getCleanChildren } from './hierarchyUtils';

// No side effects in this file — safe to import from any widget or index context.

export async function xmlGetRemText(plugin: RNPlugin, rem: Rem | undefined): Promise<string> {
  if (!rem) return '';
  const richText: RichTextInterface | undefined = rem.text;
  if (!richText || richText.length === 0) return '';
  const parts = await Promise.all(richText.map(async (item: any) => {
    if (typeof item === 'string') return item as string;
    switch (item.i) {
      case 'm': case 'x': case 'n': return (item.text as string) ?? '';
      case 'q': {
        const ref = await plugin.rem.findOne(item._id as string);
        if (ref) return xmlGetRemText(plugin, ref);
        if (item.textOfDeletedRem) {
          const sub = await Promise.all((item.textOfDeletedRem as any[]).map((s: any) =>
            typeof s === 'string' ? Promise.resolve(s) : xmlGetRemText(plugin, s)
          ));
          return sub.join('');
        }
        return '';
      }
      default: return '';
    }
  }));
  return parts.join('');
}


/**
 * Builds a nested XML structure that shows the path from the root ancestor
 * down to `rem`. Each ancestor in the path is expanded to show its direct
 * children/properties as leaves, but only the child that leads toward `rem`
 * is nested further. `rem` itself is the innermost element with its direct
 * children shown as leaves (no recursion).
 */
export async function buildParentHierarchyXml(
  plugin: RNPlugin,
  rem: Rem,
  includeEigenschaften: boolean = true
): Promise<string> {
  // Build chain upward: [focusedRem, parent, grandparent, ..., root]
  const chain: Rem[] = [rem];
  const seen = new Set<string>([rem._id]);
  let current: Rem | null | undefined = await rem.getParentRem();
  while (current) {
    if (seen.has(current._id)) break;
    seen.add(current._id);
    chain.push(current);
    current = await current.getParentRem();
  }
  // Reverse to render top-down: [root, ..., parent, focusedRem]
  chain.reverse();
  return renderChainLevel(plugin, chain, 0, 0, includeEigenschaften);
}

/** Renders `chain[chainIndex]` with its direct children as leaves, except for
 *  `chain[chainIndex + 1]` which is recursively expanded as the path child. */
async function renderChainLevel(
  plugin: RNPlugin,
  chain: Rem[],
  chainIndex: number,
  depth: number,
  includeEigenschaften: boolean
): Promise<string> {
  const rem = chain[chainIndex];
  const pathChild = chainIndex + 1 < chain.length ? chain[chainIndex + 1] : undefined;

  const indent = '  '.repeat(depth);
  const name = await xmlGetRemText(plugin, rem);
  if (!includeEigenschaften && name.trim().toLowerCase() === 'eigenschaften') return '';

  const [type, isDoc, extendsParents, children] = await Promise.all([
    rem.getType(),
    rem.isDocument(),
    getExtendsParents(plugin, rem),
    getCleanChildren(plugin, rem),
  ]);

  let typeAttr: string;
  if (type === RemType.DESCRIPTOR) typeAttr = 'directProperty';
  else if (isDoc) typeAttr = 'property';
  else typeAttr = 'child';

  const extendsNames = await Promise.all(extendsParents.map(p => xmlGetRemText(plugin, p)));
  const extendsAttr = extendsNames.length > 0
    ? ` extends="${escapeXmlAttr(extendsNames.join(','))}"` : '';

  const openTag = `${indent}<rem name="${escapeXmlAttr(name)}"${extendsAttr} type="${typeAttr}">`;

  if (children.length === 0) return `${openTag}</rem>`;

  const childXmls: string[] = [];
  for (const child of children) {
    if (pathChild && child._id === pathChild._id) {
      // This child leads toward the focused rem — expand it recursively.
      const xml = await renderChainLevel(plugin, chain, chainIndex + 1, depth + 1, includeEigenschaften);
      if (xml) childXmls.push(xml);
    } else {
      // Sibling — render as a flat leaf (no children).
      const xml = await renderRemLeaf(plugin, child, depth + 1, includeEigenschaften);
      if (xml) childXmls.push(xml);
    }
  }

  const childrenXml = childXmls.join('\n');
  if (!childrenXml) return `${openTag}</rem>`;
  return `${openTag}\n${childrenXml}\n${indent}</rem>`;
}

/** Renders a single rem as a self-contained leaf tag with no children. */
async function renderRemLeaf(
  plugin: RNPlugin,
  rem: Rem,
  depth: number,
  includeEigenschaften: boolean
): Promise<string> {
  const indent = '  '.repeat(depth);
  const name = await xmlGetRemText(plugin, rem);
  if (!includeEigenschaften && name.trim().toLowerCase() === 'eigenschaften') return '';

  const [type, isDoc, extendsParents] = await Promise.all([
    rem.getType(),
    rem.isDocument(),
    getExtendsParents(plugin, rem),
  ]);

  let typeAttr: string;
  if (type === RemType.DESCRIPTOR) typeAttr = 'directProperty';
  else if (isDoc) typeAttr = 'property';
  else typeAttr = 'child';

  const extendsNames = await Promise.all(extendsParents.map(p => xmlGetRemText(plugin, p)));
  const extendsAttr = extendsNames.length > 0
    ? ` extends="${escapeXmlAttr(extendsNames.join(','))}"` : '';

  return `${indent}<rem name="${escapeXmlAttr(name)}"${extendsAttr} type="${typeAttr}"></rem>`;
}

export function escapeXmlAttr(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function buildRemXml(
  plugin: RNPlugin,
  rem: Rem,
  visited: Set<string>,
  depth: number,
  maxDepth: number = 0,
  includeEigenschaften: boolean = true
): Promise<string> {
  if (visited.has(rem._id)) return '';
  visited.add(rem._id);

  const indent = '  '.repeat(depth);
  const name = await xmlGetRemText(plugin, rem);
  if (!includeEigenschaften && name.trim().toLowerCase() === 'eigenschaften') return '';

  const [type, isDoc, extendsParents, children] = await Promise.all([
    rem.getType(),
    rem.isDocument(),
    getExtendsParents(plugin, rem),
    getCleanChildren(plugin, rem),
  ]);

  let typeAttr: string;
  if (type === RemType.DESCRIPTOR) {
    typeAttr = 'directProperty';
  } else if (isDoc) {
    typeAttr = 'property';
  } else {
    typeAttr = 'child';
  }

  const extendsNames = await Promise.all(extendsParents.map(p => xmlGetRemText(plugin, p)));
  const extendsAttr = extendsNames.length > 0
    ? ` extends="${escapeXmlAttr(extendsNames.join(','))}"` : '';

  const openTag = `${indent}<rem name="${escapeXmlAttr(name)}"${extendsAttr} type="${typeAttr}">`;
  const closeTag = `</rem>`;

  if (children.length === 0 || (maxDepth > 0 && depth >= maxDepth)) {
    return `${openTag}${closeTag}`;
  }

  const childXmls = await Promise.all(
    children.map(child => buildRemXml(plugin, child, visited, depth + 1, maxDepth, includeEigenschaften))
  );
  const childrenXml = childXmls.filter(s => s.length > 0).join('\n');

  if (!childrenXml) {
    return `${openTag}${closeTag}`;
  }

  return `${openTag}\n${childrenXml}\n${indent}${closeTag}`;
}
