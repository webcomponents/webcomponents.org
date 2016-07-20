## Front-end client
### Running
```bash
dev_appserver.py .
```

To run against a different backend server, set the base param:
```
localhost:8080/element/PolymerElements/app-layout?base=https://custom-elements.appspot.com
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
