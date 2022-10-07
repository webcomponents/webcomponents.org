# Official lightweight Node.js image
# https://hub.docker.com/_/node
FROM node:18.10-slim

# Arbitrary but conventional working directory
WORKDIR /usr/src/app

# Install NPM dependencies
COPY package.json package-lock.json ./
COPY packages/custom-elements-manifest-tools/package.json packages/custom-elements-manifest-tools/
COPY packages/catalog-api/package.json packages/catalog-api/
COPY packages/catalog-server/package.json packages/catalog-server/
RUN npm ci

# Build the server
COPY tsconfig.base.json ./
COPY packages/custom-elements-manifest-tools/ packages/custom-elements-manifest-tools/
COPY packages/catalog-api/ packages/catalog-api/
COPY packages/catalog-server/ packages/catalog-server/
RUN npm run build -w packages/catalog-server

# External configuration parameters. Note we write these to a file because
# Kaniko doesn't include ARG values in its layer cache keys
# (https://github.com/GoogleContainerTools/kaniko/pull/1085).
ARG PORT
ARG FIRESTORE_EMULATOR_HOST
RUN echo "PORT=$PORT" >> env \
  && echo "FIRESTORE_EMULATOR_HOST=$FIRESTORE_EMULATOR_HOST" >> env

# Launch the server
CMD [ "node", "packages/catalog-server/index.js" ]
