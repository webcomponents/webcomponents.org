'use strict';

module.exports = function (grunt) {
  require('load-grunt-tasks')(grunt);

  grunt.initConfig({
    pylint: {
      options: {
        rcfile: 'pylintrc',
      },
      all: {
        src: 'src',
      },
    },

    eslint: {
      target: ['client/src/**/*.html']
    },
  });
  grunt.loadNpmTasks('grunt-pylint');
  grunt.registerTask('lint', ['pylint', 'eslint']);
}
