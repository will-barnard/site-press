export default {
  type: 'contact-form',
  label: 'Contact form',
  description: 'A form visitors fill in (name, email, message...). Submissions are saved and shown in the admin.',
  variants: ['default'],
  fields: {
    heading: { type: 'text', label: 'Heading' },
    intro: { type: 'richtext', label: 'Intro text' },
    fields: {
      type: 'list', label: 'Form fields',
      fields: {
        label: { type: 'text', label: 'Label', required: true },
        name: { type: 'text', label: 'Field key', required: true, hint: 'lowercase, no spaces' },
        type: { type: 'select', label: 'Type', options: ['text', 'email', 'tel', 'textarea'] },
        required: { type: 'boolean', label: 'Required' },
      },
    },
    submitLabel: { type: 'text', label: 'Button text', default: 'Send' },
    successMessage: { type: 'text', label: 'Thank-you message', default: 'Thanks — we will be in touch.' },
  },
};
