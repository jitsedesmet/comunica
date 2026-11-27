import { parseRmlTemplate } from '../lib/RmlTemplate';

describe('parseRmlTemplate', () => {
  it('should split text and references', () => {
    expect(parseRmlTemplate('http://example.org/{id}/{name}.html')).toEqual([
      { text: 'http://example.org/' },
      { reference: 'id' },
      { text: '/' },
      { reference: 'name' },
      { text: '.html' },
    ]);
  });

  it('should handle a template of a single reference', () => {
    expect(parseRmlTemplate('{id}')).toEqual([{ reference: 'id' }]);
  });

  it('should handle an empty template', () => {
    expect(parseRmlTemplate('')).toEqual([]);
  });

  it('should resolve escaped characters', () => {
    expect(parseRmlTemplate('a\\{b\\}\\\\{c\\}d}\\')).toEqual([
      { text: 'a{b}\\' },
      { reference: 'c}d' },
      { text: '\\' },
    ]);
  });

  it('should throw on an unclosed reference', () => {
    expect(() => parseRmlTemplate('a{b')).toThrow(`Unclosed '{' in the RML template 'a{b'`);
  });

  it('should throw on unbalanced curly braces', () => {
    expect(() => parseRmlTemplate('a}b')).toThrow(`Unexpected '}' at position 1 of the RML template 'a}b'`);
    expect(() => parseRmlTemplate('{a{b}')).toThrow(`Unexpected '{' at position 2 of the RML template '{a{b}'`);
  });
});
