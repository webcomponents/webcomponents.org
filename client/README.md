## Front-end client
### Building
```bash
cd client && npm install
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
