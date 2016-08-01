# hydro

## Hydrolysis
### Setup
Install the gcloud SDK from https://cloud.google.com/sdk/downloads#versioned

Configure your project and authentication
```bash
gcloud auth login whoeveryouare@gmail.com
gcloud config set project custom-elements-staging
```

Make sure the subscriptions and topics are setup
```bash
gcloud alpha pubsub topics create hydro-response
gcloud alpha pubsub subscriptions create hydro-response --topic hydro-response --push-endpoint https://manage-dot-custom-elements.appspot.com/_ah/push-handlers/hydro
```

## Running it locally
Install all of the dependencies (node, npm packages)

```bash
./install-and-run.sh
```

```bash
node main.js GOOGLE-CLOUD-PROJECT SUBSCRIPTION
```
or, if you want local pubsub emulation...
```bash
main.sh GOOGLE-CLOUD-PROJECT SUBSCRIPTION pubsub
```

## Deploying
```bash
deploy.sh <instance-num>
```

## Destroy and recreate all of the pubsubs
```bash
rebuild-pubsub.sh
```
