#!/usr/bin/sh

# Set of files which are to be forked into the client/src directory.
files=(
  "iron-doc-api.html"
  "iron-doc-behavior.html"
  "iron-doc-class.html"
  "iron-doc-demo.html"
  "iron-doc-element.html"
  "iron-doc-function.html"
  "iron-doc-hide-bar.html"
  "iron-doc-mixin.html"
  "iron-doc-namespace.html"
  "iron-doc-property.html"
  "iron-doc-summary.html"
  "iron-doc-viewer-behavior.html"
  "iron-doc-viewer-styles.html"
  "iron-doc-viewer.html"
)

# This strips the files of some dependencies and makes some rote changes.
for i in "${files[@]}"
do
  cat 'bower_components/iron-doc-viewer/'$i \
  | sed 's/\.\.\/marked-element\/marked-element.html/mark-down.html/' \
  | sed 's/marked-element/mark-down/' \
  | sed 's/\.\.\(\/polymer\/polymer\.html\)/..\/bower_components\1/' \
  | sed 's/\(\/iron-location\/iron-location\.html\)/\/bower_components\1/' \
  | sed '/import.*prism-/d' \
  | sed '/prism-highlighter/d' \
  | sed 's/\s*prism-theme-default\s*//' \
  | sed 's/\(\s*\)\(Polymer.IronDocViewerBehavior = {\)/\1\/\/ @polymerBehavior\'$'\n''\1\2/' \
  > 'src/'$i
done
