'use strict';

module.exports = function (grunt) {
  grunt.initConfig({
    pylint: {
      options: {
        rcfile: 'pylintrc',
      },
      all: {
        src: 'src',
      },
    },
  });
  grunt.loadNpmTasks('grunt-pylint');
  grunt.registerTask('lint', ['pylint']);
}
