#!/bin/sh

function rebuild_pubsub {
  echo "Deleting response subscription..."
  gcloud --project $1 alpha pubsub subscriptions delete analysis-responses

  echo "Deleting response topic..."
  gcloud --project $1 alpha pubsub topics delete analysis-responses

  echo "Creating response topic and push subscription..."
  gcloud --project $1 alpha pubsub topics create analysis-responses
  gcloud --project $1 alpha pubsub subscriptions create analysis-responses --topic analysis-responses --ack-deadline 60 --push-endpoint https://manage-dot-$1.appspot.com/_ah/push-handlers/analysis
}

if (( $# != 1 ))
then
  echo "Usage: rebuild_pubsub [custom-elements, custom-elements-staging]"
  exit 1
fi
rebuild_pubsub $1
