'use strict';

const test = require('ava');
const proxyquire = require('proxyquire').noCallThru();

const datastoreStub = function() {
  return {
    key: function(params) {
      if (params.includes('notexist'))
        return 'notexist';
      return '';
    },

    get: function(key) {
      if (key == 'notexist')
        return Promise.resolve([undefined]);
      var data = {
        "bowerDependencies": [
          {
            "owner": "owner",
            "repo": "repo",
            "version": "v1.0.0",
            "name": "repo"
          },
          {
            "owner": "depOwner",
            "repo": "depRepo",
            "version": "v2.0.0",
            "name": "depRepo"
          }
        ]
      };
      return Promise.resolve([{content: JSON.stringify(data)}]);
    }
  }
};

const server = proxyquire('./server', { '@google-cloud/datastore': datastoreStub });
const request = require('supertest')(server);

test.cb('absolute paths result in error', (t) => {
  request.get('/owner/repo/tag')
    .expect(400)
    .expect((response) => {
      t.regex(response.text, /Error/);
    })
    .end(t.end);
});

test.cb('bower_components should redirect paths', (t) => {
  request.get('/owner/repo/tag/my/path/bower_components/my/real/path.html')
    .expect('Location', 'owner/repo/tag/my/real/path.html')
    .expect(301)
    .end(t.end);
});

test.cb('acts sanely', (t) => {
  request.get('/owner/repo/tag/depRepo/parent/file.html')
    .expect(200)
    .end(t.end);
});

test.cb('analysis doesnt exist', (t) => {
  request.get('/this/does/notexist/depRepo/parent/file.html')
    .expect(404)
    .end(t.end);
});