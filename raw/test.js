'use strict';

const test = require('ava');
const proxyquire = require('proxyquire').noCallThru();
const nock = require('nock');
const fs = require('fs');

const datastoreStub = class {
  key(params) {
    if (params.includes('notexist'))
      return 'notexist';
    return {path: params};
  }

  get(key) {
    if (key == 'notexist')
      return Promise.resolve([undefined]);
    var data = {};
    if (key.path[1].startsWith('@')) {
      data.npmDependencies = [
        '@scope/package@1.0.0',
        'package@2.0.0',
      ];
    } else {
      data.bowerDependencies = [
        {
          owner: "owner",
          repo: "repo",
          version: "v1.0.0",
          name: "repo"
        },
        {
          owner: "depOwner",
          repo: "depRepo",
          version: "v2.0.0",
          name: "depRepo"
        }
      ];
    }
    return Promise.resolve([{content: JSON.stringify(data), status: 'ready'}]);
  }
}

const server = proxyquire('./server', {'@google-cloud/datastore': {Datastore: datastoreStub}});
const request = require('supertest')(server);

test.cb('absolute paths result in error', t => {
  request.get('/owner/repo/tag')
    .expect(400)
    .expect(response => {
      t.regex(response.text, /Error/);
    })
    .end(t.end);
});

test.cb('absolute paths result in error - transpiled', t => {
  request.get('/transpile/owner/repo/tag')
    .expect(400)
    .expect(response => {
      t.regex(response.text, /Error/);
    })
    .end(t.end);
});

test.cb('bower_components should redirect paths', t => {
  request.get('/owner/repo/tag/my/path/bower_components/my/real/path.html')
    .expect('Location', 'owner/repo/tag/my/real/path.html')
    .expect(301)
    .end(t.end);
});

test.cb('bower_components should redirect paths - transpiled', t => {
  request.get('/transpile/owner/repo/tag/my/path/bower_components/my/real/path.html')
    .expect('Location', 'owner/repo/tag/my/real/path.html')
    .expect(301)
    .end(t.end);
});

test.cb('acts sanely', t => {
  var scope = nock('https://cdn.rawgit.com')
    .get('/depOwner/depRepo/v2.0.0/parent/file.html')
    .reply(200, 'my resource');

  request.get('/owner/repo/tag/depRepo/parent/file.html')
    .expect(200, 'my resource')
    .expect('Access-Control-Allow-Origin', '*')
    .expect(() => {
      if (!scope.isDone())
        throw new Error('Did not fetch rawgit');
    })
    .end(t.end);
});

test.cb('analysis doesnt exist', t => {
  request.get('/this/does/notexist/depRepo/parent/file.html')
    .expect(404)
    .end(t.end);
});

test.cb('throws invalid dependency', t => {
  request.get('/owner/repo/tag/nodep/blah/file.html')
    .expect(400)
    .end(t.end);
});

test.cb('fetches inline demos', t => {
  request.get('/owner/repo/tag/repo/')
    .expect(200)
    .end(t.end);
});

test.cb('fetches inline demos - transpiled', t => {
  request.get('/transpile/owner/repo/tag/repo/')
    .expect(200)
    .end(t.end);
});

test.cb('does not transpile', t => {
  var classElement = fs.readFileSync('resources/class-element.html', 'utf8');
  var scope = nock('https://cdn.rawgit.com')
    .get('/depOwner/depRepo/v2.0.0/parent/file.html')
    .reply(200, classElement, {
      'Content-Type': 'text/html;charset=utf-8'
    });

  request.get('/owner/repo/tag/depRepo/parent/file.html')
    .expect(200, classElement)
    .expect('Access-Control-Allow-Origin', '*')
    .expect(() => {
      if (!scope.isDone())
        throw new Error('Did not fetch rawgit');
    })
    .end(t.end);
});

test.cb('transpiles when requested', t => {
  var classElement = fs.readFileSync('resources/class-element.html', 'utf8');
  var scope = nock('https://cdn.rawgit.com')
    .get('/depOwner/depRepo/v2.0.0/parent/file.html')
    .reply(200, classElement, {
      'Content-Type': 'text/html;charset=utf-8'
    });

  request.get('/transpile/owner/repo/tag/depRepo/parent/file.html')
    .expect(200)
    .expect('Access-Control-Allow-Origin', '*')
    .expect(response => {
      if (response.text == classElement) {
        throw new Error('Did not transpile result');
      }
    })
    .expect(() => {
      if (!scope.isDone())
        throw new Error('Did not fetch rawgit');
    })
    .end(t.end);
});

test.cb('scoped npm package - own dep', t => {
  var scope = nock('https://unpkg.com')
    .get('/@myscope/mypackage@tag/parent/file.html')
    .reply(200, 'my resource');

  request.get('/@myscope/mypackage/tag/@myscope/mypackage/parent/file.html')
    .expect(200, 'my resource')
    .expect('Access-Control-Allow-Origin', '*')
    .expect(() => {
      if (!scope.isDone())
        throw new Error('Did not fetch rawgit');
    })
    .end(t.end);
});

test.cb('scoped npm package - scoped dependency', t => {
  var scope = nock('https://unpkg.com')
    .get('/@scope/package@1.0.0/parent/file.html')
    .reply(200, 'my resource');

  request.get('/@myscope/mypackage/tag/@scope/package/parent/file.html')
    .expect(200, 'my resource')
    .expect('Access-Control-Allow-Origin', '*')
    .expect(() => {
      if (!scope.isDone())
        throw new Error('Did not fetch rawgit');
    })
    .end(t.end);
});

test.cb('scoped npm package - unscoped dependency', t => {
  var scope = nock('https://unpkg.com')
    .get('/package@2.0.0/parent/file.html')
    .reply(200, 'my resource');

  request.get('/@myscope/mypackage/tag/package/parent/file.html')
    .expect(200, 'my resource')
    .expect('Access-Control-Allow-Origin', '*')
    .expect(() => {
      if (!scope.isDone())
        throw new Error('Did not fetch rawgit');
    })
    .end(t.end);
});

test.cb('unscoped npm package - own dep', t => {
  var scope = nock('https://unpkg.com')
    .get('/mypackage@tag/parent/file.html')
    .reply(200, 'my resource');

  request.get('/@@npm/mypackage/tag/mypackage/parent/file.html')
    .expect(200, 'my resource')
    .expect('Access-Control-Allow-Origin', '*')
    .expect(() => {
      if (!scope.isDone())
        throw new Error('Did not fetch rawgit');
    })
    .end(t.end);
});

test.cb('unscoped npm package - scoped dependency', t => {
  var scope = nock('https://unpkg.com')
    .get('/@scope/package@1.0.0/parent/file.html')
    .reply(200, 'my resource');

  request.get('/@@npm/mypackage/tag/@scope/package/parent/file.html')
    .expect(200, 'my resource')
    .expect('Access-Control-Allow-Origin', '*')
    .expect(() => {
      if (!scope.isDone())
        throw new Error('Did not fetch rawgit');
    })
    .end(t.end);
});

test.cb('unscoped npm package - unscoped dependency', t => {
  var scope = nock('https://unpkg.com')
    .get('/package@2.0.0/parent/file.html')
    .reply(200, 'my resource');

  request.get('/@@npm/mypackage/tag/package/parent/file.html')
    .expect(200, 'my resource')
    .expect('Access-Control-Allow-Origin', '*')
    .expect(() => {
      if (!scope.isDone())
        throw new Error('Did not fetch rawgit');
    })
    .end(t.end);
});
