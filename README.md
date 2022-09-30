# webcomponents.org

This branch contains the packages for a new version of webcomponents.org

The currently deployed version is on the `old-site` branch.

This monorepo contains several npm packages:

- `@webcomponents/catalog-server`: A data-only backend that indexes npm packages and provides a GraphQL API into the database
- `@webcomponents/server-api`: GraphQL schemas and TypeScript interfaces for the registry API.
- `@webcomponents/custom-element-manifest-tools`: Tools for working with Custom Element Manifests

And is planned to contain:
- `@webcomponents/site-server`: A frontend server that serves the user-facing webcompoents.org site
- `@webcomponents/site-content`: An HTML client served by the frontend server


## Quick Start

1. Install dependencies:
    ```bash
    npm ci
    ```
2. Run tests:
    ```bash
    npm test
    ```
3. Start the catalog server:
    _TBD_

See [DESIGN.md](./DESIGN.md) for more information.
