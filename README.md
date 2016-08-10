# v2

[![Travis](https://img.shields.io/travis/customelements/v2.svg?maxAge=2592000)]()
[![Hex.pm](https://img.shields.io/hexpm/l/plug.svg?maxAge=2592000)]()

# Dependencies
```bash
npm install
```

## Client & analysis
For instructions, view their sub-directories `client/` and `analysis/`.

## Running tests
```bash
python tests.py $APPENGINE_SDK
```

## Deployment

Deploy to staging.
```bash
grunt lint #lints both client and python
appcfg.py update_dispatch dispatch.yaml
appcfg.py update manage.yaml
appcfg.py update api.yaml
```

Deploy client & analysis per their documentation.
