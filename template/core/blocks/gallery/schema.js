export default {
  type: 'gallery',
  label: 'Gallery',
  description: 'Three or more images in a grid, each with an optional caption, little other text.',
  variants: ['grid', 'strip'],
  fields: {
    heading: { type: 'text', label: 'Heading' },
    columns: { type: 'number', label: 'Columns', min: 1, max: 6, default: 3 },
    images: {
      type: 'list', label: 'Images',
      fields: { image: { type: 'media', label: 'Image', required: true }, caption: { type: 'text', label: 'Caption' } },
    },
  },
};
