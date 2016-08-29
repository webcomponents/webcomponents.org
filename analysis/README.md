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
Make sure you have node and npm installed and then run the following. It will
use the custom-elements-staging pubsub (but won't receive push requests for
analysis).

```bash
npm start
```

To send an analysis request, you can use the handy test message we have lying around...

```bash
curl -H "Content-Type: application/json" -i --data @message.json "localhost:8080/process/next"
```

## Deploying
```bash
gcloud app deploy analysis.yaml
```
