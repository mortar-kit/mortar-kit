# The docs site, built for production: share/mortar-docs/client (static
# files) and share/mortar-docs/server (the renderer, with its dependencies
# bundled in, so no node_modules ship). `bin/mortar-docs` runs it; PORT and
# HOST pick the address (default port 3000).
{
  lib,
  stdenv,
  runtimeShell,
  nodejs_24,
  pnpm_12,
  fetchPnpmDeps,
  pnpmConfigHook,
}:
let
  pnpm = pnpm_12;
in
stdenv.mkDerivation (finalAttrs: {
  pname = "mortar-docs";
  version = "0-unstable";

  src = lib.fileset.toSource {
    root = ../.;
    fileset = lib.fileset.unions [
      ../package.json
      ../pnpm-lock.yaml
      ../pnpm-workspace.yaml
      ../.npmrc
      ../tsconfig.json
      ../packages
      ../examples
      ../docs
    ];
  };

  nativeBuildInputs = [
    nodejs_24
    pnpm
    pnpmConfigHook
  ];

  pnpmDeps = fetchPnpmDeps {
    inherit (finalAttrs) pname version src;
    inherit pnpm;
    fetcherVersion = 5;
    hash = "sha256-mhqday2HoAFA7GMkYhEqyRBwDMokaAL6UYBlKTG0utA=";
  };

  buildPhase = ''
    runHook preBuild
    pnpm --filter mortar-docs build
    runHook postBuild
  '';

  installPhase = ''
    runHook preInstall
    mkdir -p $out/share $out/bin
    cp -r docs/dist $out/share/mortar-docs
    cat > $out/bin/mortar-docs <<EOF
    #!${runtimeShell}
    exec ${lib.getExe nodejs_24} $out/share/mortar-docs/server/node.js "\$@"
    EOF
    chmod +x $out/bin/mortar-docs
    runHook postInstall
  '';

  meta.mainProgram = "mortar-docs";
})
