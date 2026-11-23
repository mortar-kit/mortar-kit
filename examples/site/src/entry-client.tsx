// Client entry: hydrates the pages that load it (the admin, see
// src/entry-server.tsx). Public pages never load it.
import { hydrate } from '@solidjs/web';

import { Root } from './Root.tsx';

hydrate(() => <Root />, document);
