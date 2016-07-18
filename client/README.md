## Front-end client
### Running
```bash
dev_appserver.py .
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
