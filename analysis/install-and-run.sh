#!/bin/bash

##
# Startup script for analysis servers.
# Installs dependencies and launchs analysis if running in a GCE instance.
##

# Determine whether we're a GCE instance. We need this for later decisions.
IN_GCE_INSTANCE=$(gcloud info | grep gserviceaccount | cut -d "[" -f2 | cut -d "]" -f1 | wc -l)

if [[ $IN_GCE_INSTANCE -ge 1 ]] ; then
  # Create directory for code to be deployed to by deploy.sh, then cd to it.
  mkdir -m 777 /usr/local/lib/analysis
  cd /usr/local/lib/analysis

  # Install Stackdriver monitoring for instance data
  curl -O "https://repo.stackdriver.com/stack-install.sh"
  sudo bash stack-install.sh --write-gcm

  # Install Stackdriver logging agent
  curl -sSO https://dl.google.com/cloudagents/install-logging-agent.sh
  sudo bash install-logging-agent.sh
fi

# Install nvm to maintain correct node/npm versions
[[ $IN_GCE_INSTANCE -ge 1 ]] && NVM_DIR=/usr/local/lib/nvm || NVM_DIR=~/.nvm
curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.31.1/install.sh | NVM_DIR=$NVM_DIR bash

# Install make and git for analysis - if they can't be installed, reboot and try again.
sudo apt-get update && sudo apt-get install -y make git || (sleep 60 && sudo reboot)

# Install the correct version of node.js and the dependencies we need.
. $NVM_DIR/nvm.sh && \
nvm install v4.4.5 && \
npm install || (sleep 10 && sudo reboot)

# Automatically start analysis if we're running in a GCE.
if [[ $IN_GCE_INSTANCE -ge 1 ]] ; then
  GCLOUD_PROJECT=$(curl http://metadata.google.internal/computeMetadata/v1/instance/attributes/project -H "Metadata-Flavor: Google")
  TOPIC=$(curl http://metadata.google.internal/computeMetadata/v1/instance/attributes/topic -H "Metadata-Flavor: Google")
  node /usr/local/lib/analysis/main.js $GCLOUD_PROJECT $TOPIC &
fi
