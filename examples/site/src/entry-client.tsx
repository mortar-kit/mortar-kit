// Client entry: hydrates the pages that load it (see src/client.ts). Public
// pages never load it.
import { hydrate } from '@solidjs/web';

import { Root } from './Root.tsx';

hydrate(() => <Root hydrate />, document);
