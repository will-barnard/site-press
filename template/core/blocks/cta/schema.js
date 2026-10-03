export default {
  type: 'cta',
  label: 'Call to action',
  description: 'Short heading and line of text with one or two buttons, no image.',
  variants: ['centered', 'split'],
  fields: {
    heading: { type: 'text', label: 'Heading', required: true },
    body: { type: 'textarea', label: 'Text' },
    buttons: { type: 'list', label: 'Buttons', max: 2, fields: { link: { type: 'link', label: 'Button' } } },
  },
};
