#!/bin/sh

function rebuild_pubsub {
  echo "Deleting request subscription..."
  gcloud --project $1 alpha pubsub subscriptions delete analysis-requests

  echo "Deleting response subscription..."
  gcloud --project $1 alpha pubsub subscriptions delete analysis-responses

  echo "Deleting request topic..."
  gcloud --project $1 alpha pubsub topics delete analysis-requests
  echo "Deleting response topic..."
  gcloud --project $1 alpha pubsub topics delete analysis-responses

  echo "Creating response topic and push subscription..."
  gcloud --project $1 alpha pubsub topics create analysis-requests
  gcloud --project $1 alpha pubsub topics create analysis-responses
  gcloud --project $1 alpha pubsub subscriptions create analysis-responses --topic analysis-responses --ack-deadline 60 --push-endpoint https://manage-dot-$1.appspot.com/_ah/push-handlers/analysis
  gcloud --project $1 alpha pubsub subscriptions create analysis-requests --topic analysis-requests --ack-deadline 60 --push-endpoint https://analysis-dot-$1.appspot.com/process/next

}

if (( $# != 1 ))
then
  echo "Usage: rebuild_pubsub [custom-elements, custom-elements-staging]"
  exit 1
fi
rebuild_pubsub $1
