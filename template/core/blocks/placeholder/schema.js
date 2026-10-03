export default {
  type: 'placeholder',
  label: 'Imported content',
  description: 'Fallback when nothing else fits: keeps the section\'s text and images so no content is lost.',
  variants: ['default'],
  fields: {
    note: { type: 'text', label: 'Note for the editor (not shown on the site)', adminOnly: true },
    heading: { type: 'text', label: 'Heading' },
    body: { type: 'richtext', label: 'Text' },
    images: { type: 'list', label: 'Images', fields: { image: { type: 'media', label: 'Image' } } },
    buttons: { type: 'list', label: 'Buttons', fields: { link: { type: 'link', label: 'Button' } } },
  },
};
