export default {
  type: 'text-image',
  label: 'Text + image',
  description: 'One image beside a block of text, optionally a button.',
  variants: ['image-left', 'image-right'],
  fields: {
    heading: { type: 'text', label: 'Heading' },
    body: { type: 'richtext', label: 'Text' },
    image: { type: 'media', label: 'Image', required: true },
    button: { type: 'link', label: 'Button' },
  },
};
