# Guide to contributing

## Contributing process
 1. Fork this repo.
 1. Modify code on a branch of that repo.
 1. Generate a pull request.
 1. A collaborator will review your change and merge it for you.

## Architecture
It consists of multiple Appengine services and requires gcloud for most development.

At a high-level, the services are:
- Client, a Polymer web app that provides the user interface and consumes data from Api.
- Manage, a Python service dealing with ingestion and management of ingested data from Bower, Github and Analysis.
- Api, a Python service providing a REST api used by Client to access data from Manage.
- Analysis, a node.js service that performs slower analysis on ingested elements, using Bower and Hydrolysis.
- Demo, a node.js service that enables demos to be served on webcomponents.org. It utilizes the unpkg service with support for bare module specifiers.
- Raw, a node.js service that serves content from GitHub repos.


## Additional documentation for client & analysis services
For more detailed guides refer to [client](client), [analysis](analysis) & [raw](raw).

## System-level dependencies
The following dependencies are required to develop, test and/or deploy www.webcomponents.org:
- node.js (and npm) (https://nodejs.org/en/download/) - required for ALL services
- gcloud SDK (https://cloud.google.com/sdk/downloads#versioned) - required for ALL services
- Python App Engine SDK - required for ALL services. Install using `gcloud components install app-engine-python`.
- pip (Linux: https://packaging.python.org/install_requirements_linux/, Mac: "sudo easy_install pip" or https://pip.pypa.io/en/stable/installing/) - required for Manage and Api
- bower ("npm install -g bower") - required for Client
- grunt ("npm install -g grunt") - required for running lint

## Installing dependencies
```bash
npm install
```
Alternatively, you can use yarn for faster builds:
```bash
yarn
```

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
npm run lint #lints both client and python
gcloud app deploy dispatch.yaml manage.yaml api.yaml --project <your-gcloud-project-id>
```

Deploy client, analysis & raw per their documentation in their respective folders.
