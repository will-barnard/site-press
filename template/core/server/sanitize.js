import sanitizeHtml from 'sanitize-html';
import { walkMedia } from '../shared/schema.js';

// The one allowlist for rich text. Matches what the admin's editor can
// produce plus what site-press emits from captured content.
const OPTIONS = {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'a', 'ul', 'ol', 'li', 'h2', 'h3', 'h4', 'blockquote', 'span'],
  allowedAttributes: { a: ['href', 'target', 'rel'] },
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  transformTags: {
    b: 'strong',
    i: 'em',
    a: (tag, attribs) => {
      const external = /^https?:/i.test(attribs.href || '');
      return { tagName: 'a', attribs: external ? { ...attribs, target: '_blank', rel: 'noopener' } : { href: attribs.href } };
    },
  },
};

export function sanitizeRich(html) {
  return sanitizeHtml(html || '', OPTIONS).trim();
}

// Sanitise every richtext field in a props object, in place, recursing into lists.
export function sanitizeProps(fields, props) {
  for (const [name, f] of Object.entries(fields || {})) {
    if (!props) continue;
    if (f.type === 'richtext' && typeof props[name] === 'string') props[name] = sanitizeRich(props[name]);
    if (f.type === 'list' && Array.isArray(props[name])) for (const item of props[name]) sanitizeProps(f.fields, item);
  }
  return props;
}

export { walkMedia };
