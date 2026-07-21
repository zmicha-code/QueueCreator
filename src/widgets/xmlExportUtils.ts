import { RNPlugin, Rem, RemType, RichTextInterface } from '@remnote/plugin-sdk';
import { getExtendsParents, getCleanChildrenAll } from './hierarchyUtils';

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
  maxDepth: number = 0
): Promise<string> {
  if (visited.has(rem._id)) return '';
  visited.add(rem._id);

  const indent = '  '.repeat(depth);
  const [name, type, isDoc, extendsParents, children] = await Promise.all([
    xmlGetRemText(plugin, rem),
    rem.getType(),
    rem.isDocument(),
    getExtendsParents(plugin, rem),
    getCleanChildrenAll(plugin, rem),
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
    children.map(child => buildRemXml(plugin, child, visited, depth + 1, maxDepth))
  );
  const childrenXml = childXmls.filter(s => s.length > 0).join('\n');

  if (!childrenXml) {
    return `${openTag}${closeTag}`;
  }

  return `${openTag}\n${childrenXml}\n${indent}${closeTag}`;
}
