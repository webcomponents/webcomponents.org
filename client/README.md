## Front-end client
### Running
```bash
dev_appserver.py .
```

Running locally will run against the staging server. To override the backend instance set the instance parameter:
```
localhost:8080/element/PolymerElements/app-layout?instance=custom-elements.appspot.com
```

### Testing
```bash
wct --root client
```

### Deploying to staging
```bash
gulp lint
cd client
polymer build
cp client.yaml build/bundled
appcfg.py update build/bundled/client.yaml
```

### Deploying to prod
```bash
# as above
appcfg.py update build/bundled/client.yaml -A custom-elements
```
