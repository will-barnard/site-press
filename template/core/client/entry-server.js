import { renderToString } from 'vue/server-renderer';
import { createSiteApp } from './createApp.js';

// Called by core/server/ssr.js once per public page request.
export async function render(url, initial) {
  const { app, router, pinia } = createSiteApp({ ssr: true, initial });
  await router.push(url);
  await router.isReady();
  const html = await renderToString(app, {});
  return { html, state: pinia.state.value };
}
