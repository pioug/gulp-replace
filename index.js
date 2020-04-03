'use strict';

var Transform = require('readable-stream/transform');
var rs = require('replacestream');
var istextorbinary = require('istextorbinary');
var MagicString = require('magic-string');
var applySourceMap = require('vinyl-sourcemaps-apply');

module.exports = function(search, _replacement, options) {
  if (!options) {
    options = {};
  }

  if (options.skipBinary === undefined) {
    options.skipBinary = true;
  }

  return new Transform({
    objectMode: true,
    transform: function(file, enc, callback) {
      if (file.isNull()) {
        return callback(null, file);
      }

      var replacement = _replacement;
      if (typeof _replacement === 'function') {
        // Pass the vinyl file object as this.file
        replacement = _replacement.bind({ file: file });
      }

      function doReplace() {
        if (file.isStream()) {
          file.contents = file.contents.pipe(rs(search, replacement));
          return callback(null, file);
        }

        if (file.isBuffer()) {
          var magicString = new MagicString(String(file.contents));
          if (search instanceof RegExp) {
            String(file.contents).replace(search, function(...args) {
              var match = args[0];
              var offset = args[args.length - 2];
              var string = args[args.length - 1];
              var replaced = typeof replacement === 'function' ? replacement(...args) : match.replace(search, replacement);
              magicString.overwrite(offset,  offset + match.length, replaced);
              return replaced;
            })
            file.contents = new Buffer(magicString.toString());
          }
          else {
            var [chunk1, ...chunks] = String(file.contents).split(search);
            var offset = chunk1.length;
            chunks.reduce(function(acc, chunk) {
              var replaced = typeof replacement === 'function' ? replacement(search) : replacement;
              magicString.overwrite(offset, offset + search.length, replaced);
              offset += search.length + chunk.length;
              return `${acc}${replaced}${chunk}`;
            }, chunk1);
            file.contents = new Buffer(magicString.toString());
          }

          if (file.sourceMap) {
            const map = magicString.generateMap({
              file: file.basename,
              source: file.basename
            });
            applySourceMap(file, map);
          }

          return callback(null, file);
        }

        callback(null, file);
      }

      if (options && options.skipBinary) {
        istextorbinary.isText(file.path, file.contents, function(err, result) {
          if (err) {
            return callback(err, file);
          }

          if (!result) {
            callback(null, file);
          } else {
            doReplace();
          }
        });

        return;
      }

      doReplace();
    }
  });
};
