export default {
  type: 'embed',
  label: 'Video / map embed',
  description: 'An embedded YouTube or Vimeo video, Google map, or other iframe.',
  variants: ['default'],
  fields: {
    heading: { type: 'text', label: 'Heading' },
    src: { type: 'text', label: 'Embed URL', required: true, hint: 'the iframe src' },
    title: { type: 'text', label: 'Title (for screen readers)' },
    aspect: { type: 'select', label: 'Shape', options: ['16:9', '4:3', '1:1', '3:1'] },
  },
};
