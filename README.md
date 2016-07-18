# v2

[![Travis](https://img.shields.io/travis/customelements/v2.svg?maxAge=2592000)]()
[![Hex.pm](https://img.shields.io/hexpm/l/plug.svg?maxAge=2592000)]()

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
