// Server-function setup (serverFunctions.serverSetup): loads the content
// server before any call is dispatched, so createContentServer has raised
// the request body limit (1 MiB by default) to fit uploads up to
// createContent's maxAssetSize. The limit is set in one place: there.
import './server/mortar.ts';
