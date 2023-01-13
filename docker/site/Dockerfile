# Official lightweight Node.js image
# https://hub.docker.com/_/node
FROM node:18.12-slim

# Arbitrary but conventional working directory
WORKDIR /usr/src/app

# Install NPM dependencies
COPY package.json package-lock.json ./
COPY packages/custom-elements-manifest-tools/package.json packages/custom-elements-manifest-tools/
COPY packages/catalog-api/package.json packages/catalog-api/
COPY packages/site-server/package.json packages/site-server/
COPY packages/site-client/package.json packages/site-client/
COPY packages/site-content/package.json packages/site-content/
RUN npm ci

# Build the server
COPY tsconfig.base.json ./
COPY packages/custom-elements-manifest-tools packages/custom-elements-manifest-tools
COPY packages/catalog-api packages/catalog-api
COPY packages/site-server packages/site-server
COPY packages/site-client packages/site-client
COPY packages/site-content packages/site-content
RUN npm run build -w packages/site-server

# Build static assets
RUN npm run build:prod -w packages/site-content

# External configuration parameters. Note we write these to a file because
# Kaniko doesn't include ARG values in its layer cache keys
# (https://github.com/GoogleContainerTools/kaniko/pull/1085).
ARG PORT
ARG CATALOG_GRAPHQL_URL
RUN echo "PORT=$PORT" >> env \
  && echo "CATALOG_GRAPHQL_URL=$CATALOG_GRAPHQL_URL" >> env

# Launch the server
CMD [ "node", "packages/site-server/lib/prod-server.js" ]
