importScripts('/service-worker.js');

toolbox.router.get(/\/api\/search\/.*/, toolbox.networkFirst, {
  cache: {
    maxEntries:100,
    name: "search-cache",
  },
  successResponses: /^0|[123]\d\d$/,
});

toolbox.router.get(/\/api\/.*/, toolbox.networkFirst, {
  cache: {
    maxEntries:1000,
    name: "api-cache",
  },
  successResponses: /^0|[123]\d\d$/,
});
