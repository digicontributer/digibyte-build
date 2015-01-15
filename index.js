'use strict';

var gulp = require('gulp');

var coveralls = require('gulp-coveralls');
var gutil = require('gulp-util');
var jshint = require('gulp-jshint');
var mocha = require('gulp-mocha');
var rename = require('gulp-rename');
var runsequence = require('run-sequence');
var shell = require('gulp-shell');
var uglify = require('gulp-uglify');
var bump = require('gulp-bump');
var git = require('gulp-git');

function ignoreerror() {
  /* jshint ignore:start */ // using `this` in this context is weird 
  this.emit('end');
  /* jshint ignore:end */
}


/**
 * @file gulpfile.js
 *
 * Defines tasks that can be run on gulp.
 *
 * Summary: <ul>
 * <li> `test` - runs all the tests on node and the browser (mocha and karma)
 * <ul>
 * <li> `test:node`
 * <li> `test:node:nofail` - internally used for watching (due to bug on gulp-mocha)
 * <li> `test:browser`
 * </ul>`
 * <li> `watch:test` - watch for file changes and run tests
 * <ul>
 * <li> `watch:test:node`
 * <li> `watch:test:browser`
 * </ul>`
 * <li> `browser` - generate files needed for browser (browserify)
 * <ul>
 * <li> `browser:uncompressed` - build uncomprssed browser bundle (`bitcore-*.js`)
 * <li> `browser:compressed` - build compressed browser bundle (`bitcore-*.min.js`)
 * <li> `browser:maketests` - build `tests.js`, needed for testing without karma
 * </ul>`
 * <li> `lint` - run `jshint`
 * <li> `coverage` - run `istanbul` with mocha to generate a report of test coverage
 * <li> `coveralls` - updates coveralls info
 * <li> `release` - automates release process (only for maintainers)
 * </ul>
 */
function startGulp(name, opts) {

  opts = opts || {};
  var browser = !opts.skipBrowser;
  var isSubmodule = name ? true : false;
  var fullname = name ? 'bitcore-' + name : 'bitcore';
  var files = ['lib/**/*.js'];
  var tests = ['test/**/*.js'];
  var alljs = files.concat(tests);

  /**
   * testing
   */
  var testmocha = function() {
    return gulp.src(tests).pipe(new mocha({
      reporter: 'spec'
    }));
  };

  var testkarma = shell.task([
    './node_modules/karma/bin/karma start'
  ]);

  gulp.task('test:node', testmocha);

  gulp.task('test:node:nofail', function() {
    return testmocha().on('error', ignoreerror);
  });

  gulp.task('test:browser', ['browser:uncompressed', 'browser:maketests'], testkarma);

  if (browser) {
    gulp.task('test', function(callback) {
      runsequence(['test:node'], ['test:browser'], callback);
    });
  } else {
    gulp.task('test', ['test:node']);
  }

  /**
   * file generation
   */
  if (browser) {

    var browserifyCommand;

    if (isSubmodule) {
      browserifyCommand = './node_modules/.bin/browserify --require index.js:' + fullname + ' --external bitcore -o ' + fullname + '.js';
      console.log(browserifyCommand);
    } else {
      browserifyCommand = './node_modules/.bin/browserify --require index.js:bitcore -o bitcore.js';
    }

    gulp.task('browser:uncompressed', shell.task([
      browserifyCommand
    ]));

    gulp.task('browser:compressed', ['browser:uncompressed'], function() {
      return gulp.src(fullname + '.js')
        .pipe(uglify({
          mangle: true,
          compress: true
        }))
        .pipe(rename(fullname + '.min.js'))
        .pipe(gulp.dest('.'))
        .on('error', gutil.log);
    });

    gulp.task('browser:maketests', shell.task([
      'find test/ -type f -name "*.js" | xargs ./node_modules/.bin/browserify -t brfs -o tests.js'
    ]));

    gulp.task('browser', function(callback) {
      runsequence(['browser:compressed'], ['browser:maketests'], callback);
    });
  }

  /**
   * code quality and documentation
   */

  gulp.task('lint', function() {
    return gulp.src(alljs)
      .pipe(jshint())
      .pipe(jshint.reporter('default'));
  });

  gulp.task('plato', shell.task(['plato -d report -r -l .jshintrc -t ' + fullname + ' lib']));

  gulp.task('coverage', shell.task(['node_modules/.bin/./istanbul cover node_modules/.bin/_mocha -- --recursive']));

  gulp.task('coveralls', ['coverage'], function() {
    gulp.src('coverage/lcov.info').pipe(coveralls());
  });

  /**
   * watch tasks
   */

  gulp.task('watch:test', function() {
    // todo: only run tests that are linked to file changes by doing
    // something smart like reading through the require statements
    return gulp.watch(alljs, ['test']);
  });

  gulp.task('watch:test:node', function() {
    // todo: only run tests that are linked to file changes by doing
    // something smart like reading through the require statements
    return gulp.watch(alljs, ['test:node']);
  });

  if (browser) {
    gulp.task('watch:test:browser', function() {
      // todo: only run tests that are linked to file changes by doing
      // something smart like reading through the require statements
      return gulp.watch(alljs, ['test:browser']);
    });
  }

  gulp.task('watch:jsdoc', function() {
    // todo: only run tests that are linked to file changes by doing
    // something smart like reading through the require statements
    return gulp.watch(alljs, ['jsdoc']);
  });

  gulp.task('watch:coverage', function() {
    // todo: only run tests that are linked to file changes by doing
    // something smart like reading through the require statements
    return gulp.watch(alljs, ['coverage']);
  });

  gulp.task('watch:lint', function() {
    // todo: only lint files that are linked to file changes by doing
    // something smart like reading through the require statements
    return gulp.watch(alljs, ['lint']);
  });

  if (browser) {
    gulp.task('watch:browser', function() {
      return gulp.watch(alljs, ['browser']);
    });
  }

  /**
   * Release automation
   */

  gulp.task('release:install', function() {
    return shell.task([
      'npm install',
    ]);
  });

  var releaseFiles = ['./package.json'];
  if (browser) {
    releaseFiles.push('./bower.json');
  }

  gulp.task('release:bump', function() {
    return gulp.src(releaseFiles)
      .pipe(bump({
        type: 'patch'
      }))
      .pipe(gulp.dest('./'));
  });

  gulp.task('release:checkout-releases', function(cb) {
    git.checkout('releases', {
      args: ''
    }, cb);
  });

  gulp.task('release:merge-master', function(cb) {
    git.merge('master', {
      args: ''
    }, cb);
  });

  gulp.task('release:checkout-master', function(cb) {
    git.checkout('master', {
      args: ''
    }, cb);
  });

  var buildFiles = ['./package.json'];
  if (browser) {
    buildFiles.push(fullname + '.js');
    buildFiles.push(fullname + '.min.js');
    buildFiles.push('./bower.json');
  }
  gulp.task('release:add-built-files', function() {
    return gulp.src(buildFiles)
      .pipe(git.add({
        args: '-f'
      }));
  });

  gulp.task('release:build-commit', ['release:add-built-files'], function() {
    var pjson = require('../../package.json');
    return gulp.src(buildFiles)
      .pipe(git.commit('Build: ' + pjson.version, {
        args: ''
      }));
  });

  gulp.task('release:version-commit', function() {
    var pjson = require('../../package.json');
    return gulp.src(releaseFiles)
      .pipe(git.commit('Bump package version to ' + pjson.version, {
        args: ''
      }));
  });

  gulp.task('release:push-releases', function(cb) {
    git.push('bitpay', 'releases', {
      args: ''
    }, cb);
  });

  gulp.task('release:push', function(cb) {
    git.push('bitpay', 'master', {
      args: ''
    }, cb);
  });

  gulp.task('release:push-tag', function(cb) {
    var pjson = require('../../package.json');
    var name = 'v' + pjson.version;
    git.tag(name, 'Release ' + name, function() {
      git.push('bitpay', name, cb);
    });
  });

  gulp.task('release:publish', shell.task([
    'npm publish'
  ]));

  // requires https://hub.github.com/
  gulp.task('release', function(cb) {
    runsequence(
      // Checkout the `releases` branch
      ['release:checkout-releases'],
      // Merge the master branch
      ['release:merge-master'],
      // Run npm install
      ['release:install'],
      // Run tests with gulp test
      ['test'],
      // Update package.json and bower.json
      ['release:bump'],
      // Commit 
      ['release:build-commit'],
      // Run git push bitpay $VERSION
      ['release:push-tag'],
      // Push to releases branch
      ['release:push-releases'],
      // Run npm publish
      ['release:publish'],
      // Checkout the `master` branch
      ['release:checkout-master'],
      // Bump package.json and bower.json, again
      ['release:bump'],
      // Version commit with no binary files to master
      ['release:version-commit'],
      // Push to master
      ['release:push'],
      cb);
  });

}

module.exports = startGulp;
