# webcomponents.org
<p align="center">
  <img alt="webcomponents.org" src="https://www.webcomponents.org/assets/logo.svg" width="161">
</p>
<p align="center">
  <a href="https://travis-ci.org/webcomponents/beta"><img src="https://img.shields.io/travis/webcomponents/beta.svg?maxAge=2592000&style=flat-square"></a>
  <img src="https://img.shields.io/hexpm/l/plug.svg?maxAge=2592000&style=flat-square">
  <a href="https://gitter.im/webcomponents/community"><img src="https://img.shields.io/gitter/room/webcomponents/community.svg?maxAge=2592000&style=flat-square"></a>
</p>
---



The webcomponents.org site.

It consists of multiple Appengine services and requires gcloud for most development.

At a high-level, the services are
- Manage, a Python service dealing with ingestion and management of ingested data from Bower, Github and Analysis.
- Api, a Python service providing a REST api used by Client to access data from Manage.
- Client, a Polymer web app that provides the user interface and consumes data from Api.
- Analysis, a node.js service that performs slower analysis on ingested elements, using Bower and Hydrolysis.

# System-level dependencies
The following dependencies are required to develop, test and/or deploy www.webcomponents.org
- gcloud SDK (https://cloud.google.com/sdk/downloads#versioned) - needed for ALL services
- node.js (and npm) (https://nodejs.org/en/download/) - needed for ALL services
- pip (Linux: https://packaging.python.org/install_requirements_linux/, Mac: "sudo easy_install pip" or https://pip.pypa.io/en/stable/installing/) - needed for Manage and Api
- bower ("npm install -g bower") - needed for Client
- grunt ("npm install -g grunt") - needed for running lint

# Dependencies
```bash
npm install
```
Alternatively, you can use yarn for faster builds:
```bash
yarn
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
