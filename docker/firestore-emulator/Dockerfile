# Official lightweight Node.js image
# https://hub.docker.com/_/node
FROM node:18.12-slim

# Arbitrary but conventional working directory
WORKDIR /usr/src/app

# The firestore emulator uses Java
RUN apt update && apt install -y default-jre

# Install NPM dependencies
COPY package.json package-lock.json ./
COPY packages/catalog-server/package.json packages/catalog-server/
RUN npm ci

# We only need these firestore configuration files
COPY packages/catalog-server/firestore* packages/catalog-server/firebase* packages/catalog-server/

# Launch the emulator
WORKDIR packages/catalog-server
CMD [ "npm", "run", "emulators:start" ]
