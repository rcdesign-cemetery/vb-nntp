#!/usr/bin/env node

// VB-NNTP daemon main file.
//
// See https://github.com/rcdesign/vb-nntp for details
//
// License: Creative Commons BY-NC-ND 3.0
//          http://creativecommons.org/licenses/by-nc-nd/3.0/
//
// Author: Vitaly Puzrin <vitaly@rcdesign>
// Author: Aleksey V Zapparov <ixti@member.fsf.org> (http://www.ixti.net)
//
// Copyright (C) RC Design, Vitaly Puzrin

'use strict';

// include some modules and functions
var cluster = require('cluster'),
    jsyaml = require('js-yaml'),
    vbnntp = require('../lib/vb-nntp');


var CONFIG_FILE = require('fs').realpathSync() + '/config.yml';
var NUM_OF_CPUS = require('os').cpus().length;


var debug = (process.env.NODE_DEBUG && /nntp/.test(process.env.NODE_DEBUG))
          ? function () { console.error('NNTP: %s', arguments[0]); }
          : function () {};

// starts master app
function startMaster() {
  var workers = [];

  // flushes and refills pool of workers
  function initWorkers() {
    var pool = [], worker, options, max_workers;

    try {
      options = require(CONFIG_FILE).shift(),
      max_workers = +options.workers || NUM_OF_CPUS;

      // validations of options

      process.title = options.title || 'vb-nntp';
    } catch (err) {
      throw new Error("Invalid configuration:\n" + err);
    }

    while (max_workers--) {
      (function (worker) {
        pool.push(worker);
        worker.title = process.title + ' - worker [' + pool.length + ']';

        worker.on('death', function () {
          var idx = workers.indexOf(worker);
          if (0 <= idx) {
            workers[idx] = cluster.fork();
            workers[idx].title = process.title + ' - worker [' + idx + ']';
          }
        });
      }(cluster.fork()));
    }

    return pool;
  }

  try {
    workers = initWorkers();
  } catch (err) {
    console.error(err.toString());
    process.exit(1);
  }

  process.on('SIGINT', function () {
    var old_workers;

    try {
      old_workers = workers.slice(0);
      workers = initWorkers();
      old_workers.forEach(function (worker) { worker.kill('SIGINT'); });
    } catch (err) {
      console.error("Failed to reload workers:\n" + err);
    }
  });
}


function parseListenString(str) {
  return /:/.test(str) ? str.split(':') : [null, str];
}


// starts worker app
function startWorker() {
  var options = require(CONFIG_FILE).shift(),
      listen = [],
      servers = [],
      alive = 0,
      die = function () { if (0 === alive) process.exit(0); };

  if (options.listen) {
    alive++;
    listen = parseListenString(options.listen);
    servers.push(vbnntp.createServer(options).listen(listen[0], +listen[1]));
  }

  if (options.listen_ssl) {
    alive++;
    listen = parseListenString(options.listen_ssl);
    servers.push(vbnntp.createSecureServer(options).listen(listen[0], +listen[1]));
  }
  /*
  process.on('SIGINT', function () {
    servers.forEach(function (server) {
      server.stop(function () {
        alive--;
        die();
      });
    });
  });
  */
}

// run starter
//cluster.isMaster ? startMaster() : startWorker();
startWorker();


////////////////////////////////////////////////////////////////////////////////
// vim:ts=2:sw=2
////////////////////////////////////////////////////////////////////////////////
