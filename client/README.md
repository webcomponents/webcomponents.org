## Front-end client

Please also refer to the main [contributing guide](../contributing.md).

### Installing
Running the client requires Google App Engine, which can be installed using the [Google Cloud SDK](https://cloud.google.com/sdk/docs/).

Once you have the Cloud SDK installed, install App Engine for Python by running:
```bash
gcloud components install app-engine-python
```

Altenatively, you may install the [App Engine SDK for Python](https://cloud.google.com/appengine/docs/python/download) directly.

### Building
```bash
cd client && npm install
```
Using yarn:
```bash
cd client && yarn
```

### Running
Run using either of these commands:
```bash
npm run client
dev_appserver.py client/client.yaml
```

Running locally will use the production API server. To override the backend instance set the instance parameter:
```
localhost:8080/element/PolymerElements/app-layout?instance=custom-elements-staging.appspot.com
```

### Testing
```bash
wct --skip-plugin sauce
```

### Deploying to staging
Staging is automatically updated by travis on a successful build.

### Deploying to prod
```bash
cd client
polymer build
gcloud app deploy --no-promote build/bundled/client.yaml
```
