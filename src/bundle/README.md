# dsh-lit

A single DSH bundle for the literature workspace.

It contains:

- the Host plugin: `/lit-model/*` model routes and `/lit/*` proxy
- the Web client UI
- a managed `service/litd.mjs` child process
- per-profile data under `$DSH_PROFILE_DIR/lit-data`

## Install

From a packed tarball:

```text
pnpm pack
plugin_manager install_bundle <repo>/src/bundle\dsh-lit-<version>.tgz
```

From a local directory:

```text
plugin_manager install_bundle <repo>/src/bundle
pnpm install --dir <repo>/src/bundle
```

The tarball/npm package installs dependencies automatically.

```text
pnpm publish --access public
```

The bundle starts `litd` automatically on a free localhost port and proxies
`/lit/api/*` to it.

## Data

```text
$DSH_PROFILE_DIR/lit-data/
  library.db
  pdfs/
  backups/
```

The JCR table is not bundled for licensing reasons. If you have authorized
`jcr-2026.json` data, place it in `$DSH_PROFILE_DIR/lit-data/` and restart the
plugin. Without it, journal badges and JCR filters simply remain empty.

## Notes

- The client calls same-origin `/lit/api/*`; no fixed service port.
- `LITD_URL` can point to an external litd for development.
- `DSH_LIT_DATA_DIR` can override the data directory.
- Model routes use the current DSH default model and consume account tokens.
