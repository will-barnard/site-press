export default {
  type: 'card-grid',
  label: 'Cards',
  description: 'Two or more repeated items side by side, each with an image and/or title and short text (services, team, features).',
  variants: ['default', 'bordered'],
  fields: {
    heading: { type: 'text', label: 'Heading' },
    intro: { type: 'richtext', label: 'Intro text' },
    columns: { type: 'number', label: 'Columns', min: 1, max: 6, default: 3 },
    cards: {
      type: 'list', label: 'Cards',
      fields: {
        image: { type: 'media', label: 'Image' },
        title: { type: 'text', label: 'Title' },
        body: { type: 'richtext', label: 'Text' },
        link: { type: 'link', label: 'Link' },
      },
    },
  },
};
