# hydro

## Do all of the setup for cattledog first...

## Install all of the dependencies (node, npm packages)

```bash
./install-deps.sh
```

## Run it
```bash
node hydro.js GOOGLE-CLOUD-PROJECT SUBSCRIPTION
```
or, if you want local pubsub emulation...
```bash
hydro.sh GOOGLE-CLOUD-PROJECT SUBSCRIPTION pubsub
```

## Deploy a new instance
```bash
deploy-hydro.sh <instance-num>
```

## Destroy and recreate all of the pubsubs
```bash
rebuild-pubsub.sh
```
