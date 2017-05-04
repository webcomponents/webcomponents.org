'use strict';

if (process.env.NODE_ENV === 'production') {
  require('@google-cloud/debug-agent').start({allowExpressions: true});
  require('@google-cloud/trace-agent').start();
}

const express = require('express');
const datastore = require('@google-cloud/datastore')();
const https = require('https');
const app = express();
const zlib = require('zlib');

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

app.get('/[^/]+/[^/]+/[^/]+/[^/]+/', (request, response) => {
  response.sendFile(__dirname + '/inline-demo.html');
});

app.get('/:owner/:repo/:tag/:name:path(/[\\s\\S]*)', async (req, res) => {
  var owner = req.params.owner.toLowerCase();
  var repo = req.params.repo.toLowerCase();
  var tag = req.params.tag;
  var path = req.params.path;
  if (path.endsWith('/'))
    path = path + 'index.html';
  var key = datastore.key(['Library', owner + '/' + repo, 'Version', req.params.tag, 'Content', 'analysis']);

  var analysis = await datastore.get(key);

  if (!analysis.length || analysis[0] == undefined || analysis[0].status != 'ready') {
    res.status(404).send(`Could not find analysis content for ${tag} in ${owner}/${repo}`);
    return;
  }

  var content = null;
  if (analysis[0].json) {
    // Decompress and parse.
    var decompressed = zlib.unzipSync(analysis[0].json);
    content = JSON.parse(decompressed.toString());
  } else if (analysis[0].content) {
    content = JSON.parse(analysis[0].content);
  }

  if (!content || !content['bowerDependencies']) {
    res.status(404).send(`Could not find dependencies for ${tag} in ${owner}/${repo}`);
    return;
  }

  // Build a map of the repo's dependencies.
  var dependencies = content['bowerDependencies'];
  var configMap = new Map();
  dependencies.forEach(x => {
    if (x.owner != owner || x.repo != repo)
      configMap.set(x.name, `${x.owner}/${x.repo}/${x.version}`);
  });

  // Ensure the repo serves its own version.
  configMap.set(repo, `${owner}/${repo}/${tag}`);

  if (!configMap.has(req.params.name)) {
    res.status(400).send(`${req.params.name} is not a valid dependency for ${tag} in ${owner}/${repo}`);
    return;
  }

  // Fetch resource from rawgit
  const options = {
    hostname: 'cdn.rawgit.com',
    path: '/' + configMap.get(req.params.name) + path,
  }

  https.get(options, (result) => {
    if (result.statusCode != 200) {
      res.status(400).send(`Invalid response from rawgit. Received ${result.statusCode} for ${options.hostname}/${options.path}.`);
      return;
    }

    res.set({
      'Access-Control-Allow-Origin': '*',
      'Content-Type': result.headers['content-type'],
      'Cache-Control': result.headers['cache-control'] || 'max-age=315569000'
    });

    result.setEncoding('utf8');
    result.on('data', (d) => {
      res.write(d);
    });

    result.on('end', (e) => {
      res.end();
    });

  }).on('error', (e) => {
    res.status(400).send(`Error fetching from rawgit. Attempted to fetch ${options.hostname}/${options.path}.`);
  });
});

if (module === require.main) {
  const server = app.listen(process.env.PORT || 8081, () => {
    const port = server.address().port;
    console.log(`App listening on port ${port}`);
  });
}

module.exports = app;