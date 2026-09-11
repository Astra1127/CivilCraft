# Civil Craft: Bridge Edition

The Civil Craft website, Player Dashboard and Admin Dashboard, built with React, TypeScript, TanStack Start and Tailwind CSS.

## Local development

Use Node.js and npm:

```sh
npm ci
npm run dev
```

## Production build

```sh
npm run build
```

The standard Nitro Vite plugin builds the server and detects the deployment provider, including Vercel. See the [TanStack hosting guide](https://tanstack.com/start/latest/docs/framework/react/guide/hosting). The custom SSR error handler remains in src/server.ts. For the default local Node build, run `node .output/server/index.mjs`.

Gameplay images are bundled from src/assets and require no external asset proxy.

## Public game configuration

`VITE_PLAYFAB_TITLE_ID` overrides the default Civil Craft title `17FA03`. Player sign-in continues to use PlayFab.

## Administrator sign-in

Staff use server-verified Civil Craft credentials at `/admin/login`, separately from PlayFab player login.
Complete the [administrator setup guide](docs/admin-authentication.md) and the
server-only values in `.env.example`. Missing configuration fails closed.
Run `npm run test:auth` for the isolated authentication checks.

Administrative PlayFab backend setup and Phase 3 validation: [PlayFab admin backend](docs/playfab-admin-backend.md).
