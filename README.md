# webcomponents.org

A new version of webcomponents.org

The currently deployed version is on the `old-site` branch.

See [DESIGN.md](./DESIGN.md) for more information.

### Packages

This monorepo contains several npm packages:

- `@webcomponents/catalog-server`: A data-only backend that indexes npm packages and provides a GraphQL API into the database
- `@webcomponents/catalog-api`: GraphQL schemas and TypeScript interfaces for the registry API.
- `@webcomponents/custom-elements-manifest-tools`: Tools for working with Custom Element Manifests
- `@webcomponents/internal-site-content`: An HTML client served by the frontend server
- `@webcomponents/internal-site-client`: JavaScript for the site
- `@webcomponents/internal-site-server`: A frontend server that serves the user-facing webcompoents.org site

## Quick Start

1. Install dependencies:

   ```bash
   npm ci
   ```

2. Run tests:

   ```bash
   npm test
   ```

3. Start everything in development mode and watch for changes:

   ```bash
   npm start --watch
   ```

4. Visit [`http://localhost:6451/bootstrap-packages`](http://localhost:6451/bootstrap-packages) to bootstrap the database with a default set of elements.

5. Visit [`http://localhost:5450/catalog`](http://localhost:5450/catalog) and search for "button" to see example elements.

## Docker

Using Docker locally gives you the most realistic simulation of a production
environment:

```sh
npm run start:docker
```

## Ports

We use the following port scheme for consistency and to prevent collisions:

- [`localhost:5450`](http://localhost:5450): site-server in dev mode
- [`localhost:5451`](http://localhost:5451): site-server in prod mode
- [`localhost:5452`](http://localhost:5452): site-server in docker
- [`localhost:5452`](http://localhost:5453): site-server gcloud proxy
- [`localhost:6451`](http://localhost:6451): catalog-server
- [`localhost:6452`](http://localhost:6452): catalog-server in docker
- [`localhost:6452`](http://localhost:6453): catalog-server gcloud proxy
- [`localhost:7450`](http://localhost:7450): firestore-emulator
