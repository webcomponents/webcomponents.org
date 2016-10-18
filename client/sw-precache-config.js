module.exports = {
  importScripts: [
    'service-worker-runtime.js',
  ],
  navigateFallback: '/index.html',
  runtimeCaching: [{
    urlPattern: /DUMMY/,
    handler: 'networkFirst',
    options: {
      cache: {},
    },
  }]
}
