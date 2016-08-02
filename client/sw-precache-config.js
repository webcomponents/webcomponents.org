module.exports = {
  navigateFallback: '/index.html',
  runtimeCaching: [{
    urlPattern: /\/api\/search\/.*/,
    handler: 'networkFirst',
    options: {
      cache: {
        maxEntries: 100,
        name: 'search-cache',
      },
    },
    urlPattern: /\/api\/.*/,
    handler: 'networkFirst',
    options: {
      cache: {
        maxEntries: 1000,
        name: 'api-cache',
      },
    },
  }],
}
