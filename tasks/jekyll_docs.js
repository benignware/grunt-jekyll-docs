module.exports = function (grunt) {
  
  var path = require("path");
  var css = require("css");
  var string = require("string");
  var merge = require('deepmerge');
  var url = require('url');
  var git = require("nodegit");
  
  function extend(destination, source, deep) {
    var deep = typeof deep == 'undefined' ? false : deep;
    for (var property in source) {
      if (source[property] && source[property].constructor && source[property].constructor === Object) {
        destination[property] = destination[property] || {};
        arguments.callee(destination[property], source[property]);
      } else {
        destination[property] = source[property];
      }
    }
    return destination;
  }
  
  function titleize(string, alias) {
    var title = "";
    Object.keys(alias).forEach(function(key) {
      if (key.toLowerCase() === string.toLowerCase()) {
        title = alias[key];
      }
    });
    if (!title) {
      title = humanize(string);
    }
    return title;
  }
  
  function humanize(string) {
    return string.replace(/_/g, ' ').replace(/(\w+)/g, function(match) {
      return match.charAt(0).toUpperCase() + match.slice(1);
    });
  }
  
  grunt.registerMultiTask('jekyll_docs', 'jekyll-docs auto creation from markdown files', function(config) {
    
    var done = this.async();
    
    var options = merge({
      layout: 'page', 
      assets: [], 
      pygxample: {
      }, 
      clean: true, 
      css: {
      	wrap: false, 
        selector: '.highlight-example .hll', 
        exclude: []
      },  
      alias: {
        'css': 'CSS', 
        'js': 'JS', 
        'xml': 'XML', 
        'json': 'JSON'
      }, 
      theme: {
        dest: null, 
        repository: 'git://github.com/rexblack/jekyll-docs.git'
      }
    }, this.options());

    var assets = [];
    var dirMap = {};
      
    function cloneRepository(callback) {
      var target = this;
      var themeDest = options.theme.dest;
      if (options.theme.dest && !grunt.file.isDir(options.theme.dest)) {
        // download theme
        var repo_tmp = "tmp/.jekyll-docs";
        
        git.Repo.clone(options.theme.repository, repo_tmp, null, function(err, repo) {
          if (err) {
            throw err;
          }
          
          grunt.file.expand( {cwd: repo_tmp, filter: 'isFile'}, ['**/*']).forEach(function(file) {
            // Remove file or folder in path
            
            // grunt.file['delete']({force: true}, path);
            var src = path.join(repo_tmp, file);
            var dest = path.join(options.theme.dest, file);
            grunt.file.copy(src, dest);
          });
          
          if (grunt.file.isDir(repo_tmp)) {
            grunt.file['delete'](repo_tmp);
          }
        
          callback.call(target);
        });
      } else {
        callback.call(this);
      }
    }
    
    function processFile(src, dest) {
        
      var type = path.extname(src);
      
      var output = "";
      
      switch (type) {
        
        case '.md':
          
          
          var dir = path.dirname(src);
          var dirMapObject = dirMap[dir];
          
          var output = "";
          
          if (!dirMapObject || dirMapObject.content === null) {
            var filename = path.basename(src).slice(0, -path.extname(src).length);
            var name = filename;
            
            var relativePath = path.relative(this.data.dest, dest);
            relativePath = relativePath.slice(0, -path.extname(relativePath).length);
            
            var isRoot = path.dirname(relativePath).indexOf('.') == 0;
            
            var permalinkBase = path.dirname(relativePath);
            
            if (dirMapObject &&  dirMapObject.items.length > 1 || name == "README" && !isRoot) {
              relativePath = path.dirname(relativePath);
            }
            
            name = path.basename(relativePath);
            relativePath = relativePath.slice(0, -name.length);
            // strip extension
            var title = titleize(name, options.alias);
            
            if (dirMapObject) {
              dirMapObject.content = "";
            }
            
            var permalink = relativePath.indexOf('.') != 0 ? relativePath + "/" : "";
            permalink+= string(title).slugify();
            
            output = "---\n";
            output+= "layout: \"" + options.layout + "\"\n"; 
            output+= "title: \"" + title + "\"\n";
            output+= "permalink: /" + permalink + "/\n";  
            output+= "---\n";
          }
          
          output+= grunt.file.read(src);
          output+= "\n";
          
          if (dirMapObject) {
            dirMapObject.content+= output;
            dirMapObject.processed.push(src);
          }
          
          if (!dirMapObject || dirMapObject.processed.length == dirMapObject.items.length) {
            if (dirMapObject && dirMapObject.items.length > 1) {
              dest = path.dirname(dest) + ".md";
            }
            grunt.file.write(dest, dirMapObject ? dirMapObject.content : output);
          }
          
          break;
          
        case '.css':
          
          function handleCss(src, dest) {
            var contents = grunt.file.read(src);
            var obj = css.parse(contents);
            obj.stylesheet.rules.forEach(function(rule) {
              if (options.css.selector && rule.selectors) {
                rule.selectors.forEach(function(selector, index) {
                  if (options.css.wrap) {
                    if (options.css.exclude.indexOf(selector) >= 0) {
                      return;
                    } else if (selector.match(/^body/)) {
                      // is body-tag
                      selector = selector.replace(/^body/, options.css.selector);
                    } else {
                      selector = options.css.selector ? options.css.selector + " " + selector : selector;
                    }
                    rule.selectors[index] = selector;
                  }
                });
              }
              if (rule.type == "import") {
                var url = rule['import'].replace(/^"+|"+$/g, "");
                var pattern = /url\s*\(['"]*([^\'")]+)['"]*\)/;
                var match = pattern.exec(url);
                if (match) {
                  url = match[1];
                }
                var importSrc = path.normalize(path.dirname(src.toString()) + "/./" + url);
                var importDest = path.normalize(path.dirname(dest) + "/./" + path.relative(path.dirname(src.toString()), importSrc));
                var contents = grunt.file.read(importSrc);
                handleCss(importSrc, importDest);
              }
              if (rule.declarations) {
                rule.declarations.forEach(function(declaration) {
                  var value = declaration.value;
                  var pattern = /url\s*\(['"]*([^\'")]+)['"]*\)/i;
                  var match = null;
                  while (match = pattern.exec(value)) {
                    var url = match[1];
                    if (url.indexOf("data:") != 0) {
                      url = url.replace(/[\?#].*$/gi, "");
                      var importSrc = path.normalize(path.dirname(src.toString()) + "/./" + url);;
                      var importDest = path.normalize(path.dirname(dest) + "/./" + path.relative(path.dirname(src.toString()), importSrc));
                      grunt.file.copy(importSrc, importDest);
                    }
                    value = value.substring(match.index + match[0].length);
                  }
                });
              }
            });
            contents = css.stringify(obj);
            grunt.file.write(dest, contents);
          }
          
          handleCss(src, dest);
          assets = assets.concat(dest);
          break;
        
        
        case '.js': 
        
          assets = assets.concat(dest);
          grunt.file.copy(src, dest);
          break;
        
        default: 
        
          grunt.file.copy(src, dest);
      }
    }
    
    function processFiles() {
      var target = this;
      if (this.data.dest && options.clean && grunt.file.isDir(this.data.dest)) {
        grunt.file['delete'](this.data.dest);
      }
      
      grunt.file.mkdir(this.data.dest);
      
      // resolve external assets
      for (var x in this.data.src) {
        var uri = this.data.src[x];
        if (url.parse(uri).host) {
          assets.push(uri);
        }
      };
      
      this.files.forEach(function(f) {
        f.src.forEach(function(src) {
          var type = path.extname(src);
          if (type == ".md") {
            var dir = path.dirname(src);
            dirMap[dir] = dirMap[dir] || {items: [], processed: [], content: null};
            dirMap[dir].items.push(src);
          }
        });
        
      });
      this.files.forEach(function(f) {
        f.src.forEach(function(src) {
          processFile.call(target, src, f.dest);
        });
      });
    }
    
    
    function processManifest() {
      var manifestFile = options.pygxample.manifest;
      if (manifestFile) {
        var assetUrls = assets.map(function(asset) {
          return url.parse(asset).host ? asset : path.relative(path.dirname(manifestFile), asset);
        });
        var manifest = merge(options.pygxample, {
          assets: assetUrls
        });
        delete manifest['manifest'];
        grunt.file.write(manifestFile, JSON.stringify(manifest, null, "\t"));
      }
    }
    
    cloneRepository.call(this, function() {
      processFiles.call(this);
      processManifest.call(this);
      done();
    });
    
  });
};