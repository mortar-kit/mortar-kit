// Server middleware (start.middleware in vite.config): answers GET and HEAD
// for the llms.txt files and the Markdown version of each page (see
// llms/files.ts) from the published content and the generated reference;
// every other request goes on to the app.
import type { StartMiddleware } from '@solidjs/vite-plugin';

import { source } from './content/content.ts';
import { createLlms } from './llms/files.ts';
import api from './reference/api.json';
import type { ApiFile } from './reference/api.ts';

const llms = createLlms(source, api as ApiFile);

const middleware: StartMiddleware = async (event, next) => {
  const { method, url } = event.request;
  const pathname = new URL(url).pathname;
  if ((method !== 'GET' && method !== 'HEAD') || !/\.(md|txt)$/.test(pathname)) return next();
  const file = await llms.file(pathname);
  if (!file) return next();
  return new Response(file.body, { headers: { 'content-type': file.type } });
};

export default middleware;
