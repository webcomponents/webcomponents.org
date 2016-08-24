## Front-end client
### Running
```bash
dev_appserver.py client/client.yaml
```

Running locally will run against the staging server. To override the backend instance set the instance parameter:
```
localhost:8080/element/PolymerElements/app-layout?instance=custom-elements.appspot.com
```

### Testing
```bash
wct --skip-plugin sauce
```

### Deploying to staging
Staging is auto deployed on a successful build.

### Deploying to prod
```bash
cd client
polymer build
cp client.yaml build/bundled
appcfg.py update build/bundled/client.yaml
appcfg.py update build/bundled/client.yaml -A custom-elements
```
