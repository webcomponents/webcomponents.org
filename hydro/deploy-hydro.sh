#!/bin/bash
# Usage: deploy-hydro.sh <instance-num>


ZONE=us-central1-f
INSTANCE_NUM=$1
INSTANCE=instance$INSTANCE_NUM

# Extract current project name from gcloud info.
GCLOUD_PROJECT=$(gcloud info | grep "Project" | cut -d "[" -f2 | cut -d "]" -f1)
TOPIC=hydro-$INSTANCE

# Ensure that we have a valid instance, either by creating one, or by using one.
if gcloud compute instances describe $INSTANCE --zone $ZONE > /dev/null ; then
  echo "Using $INSTANCE in $ZONE"
else
  # create the instance with an all access scope
  echo "Creating $INSTANCE in $ZONE of $GCLOUD_PROJECT, pulling from $TOPIC..."
  if gcloud compute instances create $INSTANCE --machine-type g1-small \
  	 --scopes default=cloud-platform --metadata-from-file startup-script=install-and-run.sh \
  	 --metadata project=$GCLOUD_PROJECT,topic=$TOPIC --zone $ZONE ; then
  	echo "Created $INSTANCE."
  else
  	echo "Failed creating $INSTANCE. Exiting..."
  	exit
  fi
fi

echo "Attempting to deploy hydro to $INSTANCE"
n=1
until [ $n -ge 11 ]
do
  echo "Attempt $n of 10"
  gcloud compute copy-files . $INSTANCE:/usr/local/lib/hydro --zone $ZONE && break
  echo "Attempt $n failed"
  n=$[$n+1]
  sleep 5
done