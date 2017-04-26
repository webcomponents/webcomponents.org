'use strict';

if (process.env.NODE_ENV === 'production') {
  require('@google/cloud-trace').start();
  require('@google/cloud-debug').start();
}

const express = require('express');
const datastore = require('@google-cloud/datastore')();
const app = express();

// Error on absolute path values.
app.get('/:owner/:repo/:tag', (request, response) => {
  response.set('Access-Control-Allow-Origin', '*');
  response.status(400).send('Error: Invalid request. Try using a relative path if you are using an absolute path.');
});

// Redirect requests with incorrectly specified bower_components path.
app.get('/:owner/:repo/:tag/:before([\\s\\S]*)/bower_components/:after([\\s\\S]*)', (req, response) => {
  response.set('cache-control', 'max-age=315569000');
  var url = [req.params.owner, req.params.repo, req.params.tag, req.params.after].join('/');
  response.redirect(301, url);
});

app.get('/', async(request, response) => {
  await datastore.get('null').catch((err) => { 
    response.send(err);
  });
});

app.get('/:owner/:repo/:tag/:name/:path([\\s\\S]*)', async (req, res) => {
  var owner = req.params.owner.toLowerCase();
  var repo = req.params.repo.toLowerCase();
  var path = req.params.path;
  if (path.endsWith('/'))
    path = path + 'index.html';
  var key = datastore.key(['Library', owner + '/' + repo, 'Version', req.params.tag, 'Content', 'analysis']);

  var analysis = await datastore.get(key);

  if (!analysis.length || analysis[0] == undefined) {
    res.status(404).send(`Could not find analysis content for ${req.params.tag} in ${owner}/${repo}`);
    return;
  }

  res.sendStatus(200);
});

if (module === require.main) {
  const server = app.listen(process.env.PORT || 8081, () => {
    const port = server.address().port;
    console.log(`App listening on port ${port}`);
  });
}

module.exports = app;