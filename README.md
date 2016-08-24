# v2

[![Travis](https://img.shields.io/travis/customelements/v2.svg?maxAge=2592000&style=flat-square)](https://travis-ci.org/customelements/v2)
[![Hex.pm](https://img.shields.io/hexpm/l/plug.svg?maxAge=2592000&style=flat-square)]()

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
To increase Github API quota, acqure a Github token and store it:
```bash
cat > secrets.yaml
github_token: 'your-github-token'
```

If you would like to use reCAPTCHA, obtain a token and store it:
```bash
cat > secrets.yaml
recaptcha: 'your-token'
```

Deploy to staging.
```bash
grunt lint #lints both client and python
appcfg.py update_dispatch dispatch.yaml
appcfg.py update manage.yaml
appcfg.py update api.yaml
```

Deploy client & analysis per their documentation.
