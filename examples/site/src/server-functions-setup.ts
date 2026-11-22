// Server-function setup (serverFunctions.serverSetup): raises the request
// body limit (1 MiB by default) so the admin can upload files up to the
// content's 25 MB limit (createContent's maxAssetSize).
import { configureServerFunctionsServer } from '@solidjs/web/server-functions/server';

configureServerFunctionsServer({ bodySizeLimit: 26 * 1024 * 1024 });
