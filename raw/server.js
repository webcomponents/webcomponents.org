/* eslint-env node */
'use strict';

if (process.env.NODE_ENV === 'production') {
  require('@google-cloud/debug-agent').start({allowExpressions: true});
  require('@google-cloud/trace-agent').start();
}

const express = require('express');
const datastore = require('@google-cloud/datastore')();
const request = require('request');
const app = express();
const zlib = require('zlib');
const path = require('path');
const polyservePath = path.dirname(require.resolve('polyserve'));
const babelCompile = require(path.resolve(polyservePath, 'compile-middleware')).babelCompile;
const injectCustomElementsEs5Adapter = require(path.resolve(polyservePath, 'custom-elements-es5-adapter-middleware')).injectCustomElementsEs5Adapter;

app.use('/transpile/*', injectCustomElementsEs5Adapter(true));
app.use('/transpile/*', babelCompile(true));

function optionalTranspile(path) {
  return ['/transpile' + path, path];
}

// Error on absolute path values.
app.get(optionalTranspile('/:owner/:repo/:tag'), (request, response) => {
  response.set('Access-Control-Allow-Origin', '*');
  response.status(400).send('Error: Invalid request. Try using a relative path if you are using an absolute path.');
});

// Redirect requests with incorrectly specified bower_components path.
app.get(optionalTranspile('/:owner/:repo/:tag/:before([\\s\\S]*)/bower_components/:after([\\s\\S]*)'), (req, response) => {
  response.set('cache-control', 'max-age=315569000');
  const url = [req.params.owner, req.params.repo, req.params.tag, req.params.after].join('/');
  response.redirect(301, url);
});

app.get(optionalTranspile('/[^/]+/[^/]+/[^/]+/[^/]+/'), (request, response) => {
  response.sendFile(path.resolve(__dirname, 'inline-demo.html'));
});

app.get(optionalTranspile('/:owner/:repo/:tag/:path([\\s\\S]*)'), async (req, res) => {
  const owner = req.params.owner.toLowerCase();
  const repo = req.params.repo.toLowerCase();
  const tag = req.params.tag;
  const match = req.params.path.match(/((?:@[^/]+\/)?[^/]+)(.*)/);
  if (match.length != 3) {
    req.status(400).send('Something went wrong, cant figure out the name');
    return;
  }

  const name = match[1];
  let path = match[2];
  if (path.endsWith('/'))
    path += 'index.html';
  const key = datastore.key(['Library', owner + '/' + repo, 'Version', req.params.tag, 'Content', 'analysis']);

  const analysis = await datastore.get(key);

  if (!analysis.length || analysis[0] == undefined || analysis[0].status != 'ready') {
    res.status(404).send(`Could not find analysis content for ${tag} in ${owner}/${repo}`);
    return;
  }

  let content = null;
  if (analysis[0].json) {
    // Decompress and parse.
    const decompressed = zlib.unzipSync(analysis[0].json);
    content = JSON.parse(decompressed.toString());
  } else if (analysis[0].content) {
    content = JSON.parse(analysis[0].content);
  }

  if (!content || !(content.bowerDependencies || content.npmDependencies)) {
    res.status(404).send(`Could not find dependencies for ${tag} in ${owner}/${repo}`);
    return;
  }

  // Build a map of the repo's dependencies.
  const configMap = new Map();
  if (content.bowerDependencies) {
    content.bowerDependencies.forEach(x => {
      if (x.owner != owner || x.repo != repo)
        configMap.set(x.name, `${x.owner}/${x.repo}/${x.version}`);
    });
    // Ensure the repo serves its own version.
    configMap.set(repo, `${owner}/${repo}/${tag}`);
  } else if (content.npmDependencies) {
    content.npmDependencies.forEach(dep => {
      configMap.set(dep.substring(0, dep.lastIndexOf('@')), dep);
    });
    // Ensure the repo serves its own version.
    const ownerString = owner == '@@npm' ? '' : owner + '/';
    configMap.set(`${ownerString}${repo}`, `${ownerString}${repo}@${tag}`);
  }

  if (!configMap.has(name)) {
    res.status(400).send(`${name} is not a valid dependency for ${tag} in ${owner}/${repo}`);
    return;
  }

  // Fetch resource from rawgit
  const baseUrl = owner.startsWith('@') ? 'https://unpkg.com/' : 'https://cdn.rawgit.com/';
  const url = baseUrl + configMap.get(name) + path;
  request.get(url).on('response', result => {
    if (result.statusCode != 200) {
      res.status(400).send(`Invalid response from rawgit. Received ${result.statusCode} for ${url}`);
      return;
    }

    res.set({
      'Access-Control-Allow-Origin': '*',
      'Content-Type': result.headers['content-type'],
      'Cache-Control': result.headers['cache-control'] || 'max-age=315569000'
    });

    result.on('data', d => {
      res.write(d);
    });

    result.on('end', () => {
      res.end();
    });
  }).on('error', () => {
    res.status(400).send(`Error fetching from rawgit. Attempted to fetch ${url}.`);
  });
});

if (module === require.main) {
  const server = app.listen(process.env.PORT || 8081, () => {
    const port = server.address().port;
    console.log(`App listening on port ${port}`);
  });
}

module.exports = app;
