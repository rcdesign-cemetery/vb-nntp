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


// starts master app
function startMaster() {
  var workers = [];

  // flushes and refills pool of workers
  function initWorkers() {
    var pool = [], options, amountOfWorkers;

    try {
      options = require(CONFIG_FILE),
      amountOfWorkers = +options.workers || NUM_OF_CPUS;
      vbnntp.validateConfig(options);
    } catch (err) {
      throw new Error("Invalid configuration:\n" + err);
    }

    while (amountOfWorkers--) {
      pool.push(cluster.fork());
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
    var old_pool;
    
    try {
      old_pool = workers.slice(0);
      workers = initWorkers();
      old_pool.forEach(function (worker) { worker.kill('SIGINT'); });
    } catch (err) {
      console.error("Failed to reload workers:\n" + err);
    }
  });
}


// starts worker app
function startWorker() {
  var options = require(CONFIG_FILE), servers = [];

  if (options.listen) {
    servers.push(vbnntp.createServer(options).start(options.listen));
  }

  if (options.listen_ssl) {
    servers.push(vbnntp.createSecureServer(options).start(options.listen_ssl));
  }

  process.on('SIGINT', function () {
    servers.forEach(function (server) {
      server.stop();
    });
  });
}


// run starter
cluster.isMaster ? startMaster() : startWorker();


////////////////////////////////////////////////////////////////////////////////
// vim:ts=2:sw=2
////////////////////////////////////////////////////////////////////////////////
