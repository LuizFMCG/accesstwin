# AccessTwin agent guidance

These instructions apply to the entire repository.

## Canonical environment

- Use Node.js 22 or newer, as declared in `package.json`.
- Use the npm version declared by `packageManager`.
- Install dependencies with `npm ci`.
- If an agent environment starts on Node.js 20, configure that environment to
  use Node.js 22. Do not lower the repository runtime requirement to match the
  agent container.

## Required validation

Run the complete validation before proposing a pull request:

```bash
npm ci
npm run check
git diff --check
git status --short
```

`npm run check` intentionally validates both the official Next.js build and the
Vinext/Cloudflare package used by ChatGPT Sites. Do not weaken this command to
make an incompatible environment pass.

## Hosting invariants

The current production target is the existing ChatGPT Sites project identified
by `.openai/hosting.json`.

Do not remove, replace, or bypass any of the following without an explicit
hosting-migration request from the user:

- `.openai/hosting.json`;
- `vinext` and `@vinext/cloudflare`;
- Wrangler and the Cloudflare Vite integration;
- `vite.config.ts` and `wrangler.jsonc`;
- `scripts/copy-hosting-config.mjs`;
- the Vinext build and postbuild scripts in `package.json`.

Next.js pages and API routes working under `next start` do not prove that the
ChatGPT Sites artifact is valid. Preserve and test both build paths.

Never patch installed files inside `node_modules`. Never change the product,
runtime, package manager, or hosting provider merely to accommodate a temporary
agent environment.

## Change and deployment safety

- Work on a dedicated branch and use a pull request. Do not push directly to
  `main`.
- Preserve unrelated user changes.
- Do not publish or deploy unless the user explicitly requests deployment.
- For a Sites deployment, use the existing project ID and deploy only the exact
  source commit that was pushed and saved as a site version.
- Do not change production access controls, environment variables, Google Cloud
  resources, API keys, quotas, or billing settings without explicit approval.
- Never commit tokens, API keys, credentials, `.env.local`, or generated secret
  material.

## Product invariants

- Preserve both the deterministic no-cost exploration mode and the explicitly
  confirmed Google live mode.
- Keep composition similarity, volume, and density explainable as separate
  concepts.
- Changes to the Jensen-Shannon ranking weights, territorial catalog, API-call
  limits, cache behavior, or cost guardrails require an explicit product
  decision and corresponding tests/documentation.
