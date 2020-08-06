const fs = require('fs')
const _ = require('lodash')

module.exports = function(grunt) {
  require('load-grunt-tasks')(grunt)

  grunt.initConfig({
    modules: [], //to be filled in by build task
    pkg: grunt.file.readJSON('package.json'),
    dist: 'dist',
    filename: 'ui-bootstrap',
    meta: {
      tplmodules: 'angular.module("ui.bootstrap.tpls", [<%= tplModules %>]);',
      all: 'angular.module("ui.bootstrap", ["ui.bootstrap.tpls", <%= srcModules %>]);',
      cssInclude: '',
      cssFileBanner: '/* Include this file in your html if you are using the CSP mode. */\n\n',
      cssFileDest: '<%= dist %>/<%= filename %>-<%= pkg.version %>-csp.css'
    },
    concat: {
      dist_tpls: {
        options: {
          banner: '<%= meta.all %>\n<%= meta.tplmodules %>\n',
          footer: '<%= meta.cssInclude %>'
        },
        src: [], //src filled in by build task
        dest: '<%= dist %>/<%= filename %>-tpls-<%= pkg.version %>.js'
      }
    }
  })

  //Common ui.bootstrap module containing all modules for src and templates
  //findModule: Adds a given module to config
  const foundModules = {}
  function findModule(name) {
    if (foundModules[name]) {
      return
    }
    foundModules[name] = true

    function breakup(text, separator) {
      return text.replace(/[A-Z]/g, function(match) {
        return separator + match
      })
    }
    function ucwords(text) {
      return text.replace(/^([a-z])|\s+([a-z])/g, function($1) {
        return $1.toUpperCase()
      })
    }
    function enquote(str) {
      return `"${str}"`
    }
    function enquoteUibDir(str) {
      return enquote(`uib/${str}`)
    }

    const module = {
      name: name,
      moduleName: enquote(`ui.bootstrap.${name}`),
      displayName: ucwords(breakup(name, ' ')),
      srcFiles: grunt.file.expand([`src/${name}/*.js`, `!src/${name}/index.js`, `!src/${name}/index-nocss.js`]),
      cssFiles: grunt.file.expand(`src/${name}/*.css`),
      tpljsFiles: grunt.file.expand(`template/${name}/*.html.js`),
      tplModules: grunt.file.expand(`template/${name}/*.html`).map(enquoteUibDir),
      dependencies: dependenciesForModule(name)
    }

    const styles = {
      css: [],
      js: []
    }
    module.cssFiles.forEach(processCSS.bind(null, module.name, styles))
    if (styles.css.length) {
      module.css = styles.css.join('\n')
      module.cssJs = styles.js.join('\n')
    }

    module.dependencies.forEach(findModule)
    grunt.config('modules', grunt.config('modules').concat(module))
  }

  function dependenciesForModule(name) {
    let deps = []
    grunt.file.expand([`src/${name}/*.js`, `!src/${name}/index.js`, `!src/${name}/index-nocss.js`])
    .map(grunt.file.read)
    .forEach(function(contents) {
      //Strategy: find where module is declared,
      //and from there get everything inside the [] and split them by comma
      const moduleDeclIndex = contents.indexOf('angular.module(')
      const depArrayStart = contents.indexOf('[', moduleDeclIndex)
      const depArrayEnd = contents.indexOf(']', depArrayStart)
      const dependencies = contents.substring(depArrayStart + 1, depArrayEnd)
      dependencies.split(',').forEach(function(dep) {
        if (dep.indexOf('ui.bootstrap.') > -1) {
          const depName = dep.trim().replace('ui.bootstrap.', '').replace(/['"]/g, '')
          if (deps.indexOf(depName) < 0) {
            deps.push(depName)
            //Get dependencies for this new dependency
            deps = deps.concat(dependenciesForModule(depName))
          }
        }
      })
    })
    return deps
  }

  grunt.registerTask('build', 'Create bootstrap build files', function() {
    const _ = grunt.util._

    grunt.file
      .expand({ filter: 'isDirectory', cwd: '.' }, 'src/*')
      .forEach((dir) => {
        findModule(dir.split('/')[1])
      })

    const modules = grunt.config('modules')
    grunt.config('srcModules', _.map(modules, 'moduleName'))
    grunt.config('tplModules', _.map(modules, 'tplModules').filter((tpls) => tpls.length > 0))

    const cssStrings = _.flatten(_.compact(_.map(modules, 'css')))
    const cssJsStrings = _.flatten(_.compact(_.map(modules, 'cssJs')))
    if (cssStrings.length) {
      grunt.config('meta.cssInclude', cssJsStrings.join('\n'))
      grunt.file.write(grunt.config('meta.cssFileDest'), grunt.config('meta.cssFileBanner') + cssStrings.join('\n'))
      grunt.log.writeln('File ' + grunt.config('meta.cssFileDest') + ' created')
    }

    const srcFiles = _.map(modules, 'srcFiles')
    const tpljsFiles = _.map(modules, 'tpljsFiles')

    grunt.config('concat.dist_tpls.src', grunt.config('concat.dist_tpls.src').concat(srcFiles).concat(tpljsFiles))

    grunt.task.run(['concat'])
  })

  function processCSS(moduleName, state, file) {
    let css = fs.readFileSync(file).toString()
    let js
    state.css.push(css)

    css = css.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, '\\n')
    js = `angular.module('ui.bootstrap.${moduleName}').run(function() {!angular.$$csp().noInlineStyle && !angular.$$uib${_.capitalize(moduleName)}Css && angular.element(document).find('head').prepend('<style type="text/css">${css}</style>'); angular.$$uib${_.capitalize(moduleName)}Css = true; });`
    state.js.push(js)

    return state
  }

  return grunt
}
