# Analysis

## Setup
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
Make sure you have node and npm (and, optionally, yarn) installed and then run npm start.
Analysis will run in debug mode, with the response JSON output to the console.
```bash
npm install
npm start
```

To send a local analysis request, you can use curl (the last param - commit sha - is optional)...

```bash
curl -i "localhost:8080/task/analyze/PolymerElements/paper-dialog-behavior/v1.2.7/eacabc02ab06e03f17d26e0b777b102bdc2ed556" -H "x-appengine-queuename:analysis"
```

## Deploying
First deploy to the staging server.
```bash
gcloud --project custom-elements-staging app deploy analysis.yaml
```
Delete and reinstall paper-progress and then view the element to verify that analysis is still working correctly.
```bash
https://manage-dot-custom-elements-staging.appspot.com/manage/delete/polymerelements/paper-progress
https://manage-dot-custom-elements-staging.appspot.com/manage/add/polymerelements/paper-progress

https://custom-elements-staging.appspot.com/element/PolymerElements/paper-progress
```
Check that the API documentation is present and contains the API reference.
Check that the inline demo appears and works correctly.
Check that the popup demo appears and works correctly.

If the change requires a re-analysis of all elements.
```bash
https://manage-dot-custom-elements-staging.appspot.com/manage/analyze-all
```

When satisfied with the staging deployment, deploy to production.

```bash
gcloud --project custom-elements app deploy analysis.yaml
```
