export default {
  type: 'rich-text',
  label: 'Text',
  description: 'Formatted text only: headings, paragraphs, lists. No images.',
  variants: ['default', 'narrow'],
  fields: {
    body: { type: 'richtext', label: 'Text', required: true, hint: 'include any headings as <h2>/<h3>' },
  },
};
