#!/bin/bash
# Simple little hacky script to set environment vars if pub sub is running.
#
# Usage: hydro.sh project subscription ?pubsub?
#

if [ "$3" == "pubsub" ]
then
  gcloud beta emulators pubsub start > pubsub.out 2>&1 &
  sleep 1
fi

pse_running=$(ps -ef | grep "gcloud beta emulators pubsub start" | wc -l)
if [[ $pse_running -ge 2 ]]
then
  echo "Pubsub emulator running, setting environment vars"
  $(echo `gcloud beta emulators pubsub env-init`)
  echo "Running on $PUBSUB_EMULATOR_HOST"
fi

node hydro.js $1 $2

if [ "$3" == "pubsub" ]
then
  echo "Shutting down pubsub emulator"
  kill $!
fi

