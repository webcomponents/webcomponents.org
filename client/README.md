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
appcfg.py update app.yaml
```

### Deploying to prod
```bash
appcfg.py update app.yaml -A custom-elements
