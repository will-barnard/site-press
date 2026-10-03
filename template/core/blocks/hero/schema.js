export default {
  type: 'hero',
  label: 'Hero',
  description: 'Large opening section: big heading, optional subheading, buttons, and an image either behind the text (centered/left) or beside it (split-*).',
  variants: ['centered', 'left', 'split-left', 'split-right'],
  fields: {
    eyebrow: { type: 'text', label: 'Small text above heading' },
    heading: { type: 'text', label: 'Heading', required: true },
    subheading: { type: 'textarea', label: 'Subheading' },
    image: { type: 'media', label: 'Image' },
    buttons: { type: 'list', label: 'Buttons', max: 2, fields: { link: { type: 'link', label: 'Button' } } },
  },
};
