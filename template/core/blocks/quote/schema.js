export default {
  type: 'quote',
  label: 'Quote',
  description: 'A testimonial or pull quote with an attribution.',
  variants: ['default', 'large'],
  fields: {
    quote: { type: 'textarea', label: 'Quote', required: true },
    attribution: { type: 'text', label: 'Attribution' },
    image: { type: 'media', label: 'Photo' },
  },
};
