/**
 * A part of an RML template: either fixed text, or a reference to substitute.
 */
export type RmlTemplatePart = { text: string } | { reference: string };

/**
 * Split an RML template into its fixed text and its references, resolving backslash escapes.
 * @param template The template, such as `http://example.org/{id}`.
 * @return The parts of the template, in order.
 * @throws Error if a curly brace is not balanced.
 */
export function parseRmlTemplate(template: string): RmlTemplatePart[] {
  const parts: RmlTemplatePart[] = [];
  let current = '';
  let isInReference = false;
  for (let index = 0; index < template.length; index++) {
    const character = template[index];
    if (character === '\\' && index + 1 < template.length) {
      current += template[++index];
    } else if (character === '{' && !isInReference) {
      if (current) {
        parts.push({ text: current });
      }
      current = '';
      isInReference = true;
    } else if (character === '}' && isInReference) {
      parts.push({ reference: current });
      current = '';
      isInReference = false;
    } else if (character === '{' || character === '}') {
      throw new Error(`Unexpected '${character}' at position ${index} of the RML template '${template}'`);
    } else {
      current += character;
    }
  }
  if (isInReference) {
    throw new Error(`Unclosed '{' in the RML template '${template}'`);
  }
  if (current) {
    parts.push({ text: current });
  }
  return parts;
}
