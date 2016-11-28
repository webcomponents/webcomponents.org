module.exports = {
  importScripts: [
    'service-worker-runtime.js',
  ],
  navigateFallback: '/index.html',
  // Must be kept in sync with client.yaml
  navigateFallbackWhitelist: [
    /^\/(index.html)?$/,
    /^\/(about|introduction|community|assets)(\/.*)?$/,
    /^\/(author|collections?|elements?|search|preview|preview-integration|publish|publish-collection)(\/.*)?$/,
  ],
  runtimeCaching: [{
    urlPattern: /DUMMY/,
    handler: 'networkFirst',
    options: {
      cache: {},
    },
  }]
}
