#!/bin/sh

function rebuild_pubsub {
  echo "Deleting request subscription..."
  gcloud alpha pubsub subscriptions delete analysis-requests

  echo "Deleting response subscription..."
  gcloud alpha pubsub subscriptions delete analysis-responses

  echo "Deleting request topic..."
  gcloud alpha pubsub topics delete analysis-requests
  echo "Deleting response topic..."
  gcloud alpha pubsub topics delete analysis-responses

  echo "Creating response topic and push subscription..."
  gcloud alpha pubsub topics create analysis-requests
  gcloud alpha pubsub topics create analysis-responses
  gcloud alpha pubsub subscriptions create analysis-responses --topic analysis-responses --ack-deadline 60 --push-endpoint https://manage-dot-custom-elements.appspot.com/_ah/push-handlers/analysis
  gcloud alpha pubsub subscriptions create analysis-requests --topic analysis-requests --ack-deadline 60 --push-endpoint https://analysis-dot-custom-elements.appspot.com/process/next

}

rebuild_pubsub
