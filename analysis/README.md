# Analysis

## Analysis
### Setup
Install the gcloud SDK from https://cloud.google.com/sdk/downloads#versioned

Configure your project and authentication
```bash
gcloud auth login whoeveryouare@gmail.com
gcloud config set project custom-elements-staging
```

Make sure the subscriptions and topics are setup
```bash
rebuild-pubsub.sh [custom-elements, custom-elements-staging]
```

## Running it locally
Install all of the dependencies (node, npm packages)

```bash
./install-and-run.sh
```

```bash
node main.js GOOGLE-CLOUD-PROJECT
```

## Deploying
```bash
gcloud app deploy analysis.yaml
```
