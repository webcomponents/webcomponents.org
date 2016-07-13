#!/bin/sh

function delete_subs_matching {
  gcloud alpha pubsub subscriptions list | grep $1 | cut -d \| -f 3 | xargs gcloud alpha pubsub subscriptions delete
}

function delete_topics_matching {
  gcloud alpha pubsub topics list | grep $1 | grep topicId | cut -d : -f 2 | xargs gcloud alpha pubsub topics delete
}

function rebuild_pubsub {
  echo "Deleting instance request subscriptions..."
  delete_subs_matching hydro-instance
  echo "Deleting response subscription..."
  delete_subs_matching hydro-response

  echo "Deleting instance request topics..."
  delete_topics_matching hydro-instance
  echo "Deleting response topic..."
  delete_topics_matching hydro-response

  echo "Creating response topic and push subscription..."
  gcloud alpha pubsub topics create hydro-response
  gcloud alpha pubsub subscriptions create hydro-response --topic hydro-response --ack-deadline 60 --push-endpoint https://manage-dot-custom-elements.appspot.com/_ah/push-handlers/hydro

  echo "Restarting hydro instances..."
  gcloud compute instances list | grep instance | cut -d " " -f 1 | xargs gcloud compute instances reset --zone us-central1-f
}

rebuild_pubsub
