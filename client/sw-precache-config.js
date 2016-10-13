module.exports = {
  navigateFallback: '/index.html',
  runtimeCaching: [{
    urlPattern: /DUMMY/,
    handler: 'networkFirst',
    options: {
      cache: {},
    },
  }]
}
