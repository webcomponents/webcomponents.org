#!/bin/bash
# We're in a GCE instance if we're running under a google service account.
IN_GCE_INSTANCE=$(gcloud info | grep gserviceaccount | cut -d "[" -f2 | cut -d "]" -f1 | wc -l)

if [[ $IN_GCE_INSTANCE -ge 1 ]] ; then
  # make a place that the code can be uploaded to.
  mkdir -m 777 /usr/local/lib/analysis
  curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.31.1/install.sh | NVM_DIR=/usr/local/lib/nvm bash
  NVM_SH=/usr/local/lib/nvm/nvm.sh
else
  curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.31.1/install.sh | bash
  NVM_SH=~/.nvm/nvm.sh
fi

# Install dependencies for analysis - if they can't be installed, exit.
sudo apt-get update && sudo apt-get install -y make git || exit

. $NVM_SH && \
nvm install v4.4.5 && \
npm install bower hydrolysis gcloud repeat

# Start analysis if we're running in a GCE.
if [[ $IN_GCE_INSTANCE -ge 1 ]]
then
  GCLOUD_PROJECT=$(curl http://metadata.google.internal/computeMetadata/v1/instance/attributes/project -H "Metadata-Flavor: Google")
  TOPIC=$(curl http://metadata.google.internal/computeMetadata/v1/instance/attributes/topic -H "Metadata-Flavor: Google")
  node /usr/local/lib/analysis/main.js $GCLOUD_PROJECT $TOPIC &
fi
