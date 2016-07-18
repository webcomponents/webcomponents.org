# hydro

## Hydrolysis
### Setup
Install the gcloud SDK from https://cloud.google.com/sdk/downloads#versioned

Configure your project and authentication
```bash
gcloud auth login whoeveryouare@gmail.com
gcloud config set project custom-elements
```

Make sure the subscriptions and topics are setup
```bash
gcloud alpha pubsub topics create hydro hydroResponse
gcloud alpha pubsub subscriptions create hydroResponse --topic hydroResponse --push-endpoint https://custom-elements.appspot.com/_ah/push-handlers/hydrolyzer
```

Install all of the dependencies (node, npm packages)

```bash
./install-and-run.sh
```

## Running it
```bash
node hydro.js GOOGLE-CLOUD-PROJECT SUBSCRIPTION
```
or, if you want local pubsub emulation...
```bash
hydro.sh GOOGLE-CLOUD-PROJECT SUBSCRIPTION pubsub
```

## Deploying
```bash
deploy-hydro.sh <instance-num>
```

## Destroy and recreate all of the pubsubs
```bash
rebuild-pubsub.sh
```
