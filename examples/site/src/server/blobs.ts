// Where the example keeps uploaded files: `uploads/<key>`, resolved against
// the working directory (run the server from examples/site), served at
// /uploads/ by src/middleware.ts. Server-only: imported by the content
// server functions and the middleware, never by client code.
import { createFileBlobStore } from '@mortar-kit/core/server';

export const blobs = createFileBlobStore({ dir: 'uploads', baseUrl: '/uploads/' });
