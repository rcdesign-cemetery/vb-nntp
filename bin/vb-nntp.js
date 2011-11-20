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
var fs = require('fs'),
    events = require('events'),
    cluster = require('cluster'),
    jsyaml = require('js-yaml'),
    vbnntp = require('../lib/vb-nntp');


var CONFIG_FILE = require('fs').realpathSync() + '/config.yml';


function parseListenString(binding) {
  binding = binding.split(':');
  return (1 === binding.length) ? {port: +binding[0]}
                                : {host: binding[0], port: +binding[1]};
}


// starts master app
function startMaster() {
  var options = require(CONFIG_FILE).shift(),
      ps_title = options.title || 'vbnntp',
      workers_amount = +options.workers || require('os').cpus().length,
      logger = vbnntp.logger.create(options.logger),
      workers = [];

  function addWorker() {
    var worker = cluster.fork();

    vbnntp.logger.attachLogger(worker, logger);
    workers.push(worker);

    logger.info('VBNNTP New worker added', {idx: workers.length, pid: worker.pid});
    worker.send({title: ps_title + '[worker:' + workers.length + ']'});

    worker.on('death', function (worker) {
      var idx;

      logger.warn('VBNNTP Worker ' + worker.pid + ' died. Restart...');

      idx = workers.indexOf(worker);
      if (0 <= idx) {
        delete workers[idx];
      }

      addWorker();
    });
  }

  process.on('SIGHUP', function () {
    var old_workers = workers, worker = null;

    logger.info('VBNNTP Restarting workers');

    // start new workers
    workers = [];
    while (workers.length < workers_amount) {
      addWorker();
    }

    // request old workers to stop listen new connections
    while (old_workers.length) {
      worker = old_workers.shift();

      logger.debug('VBNNTP Stoppping worker', {pid: worker.pid});

      worker.removeAllListeners('death');
      worker.send({stop: true});

      // unref
      worker = null;
    }
  });

  process.on('SIGINT', function () {
    workers.forEach(function (worker) {
      worker.send({stop: true});
    });
    process.exit(0);
  });

  process.on('uncaughtException', function (err) {
    logger.error('Unexpected exception: ' + (err.message || err.toString()));
  });

  process.title = ps_title;

  while (workers.length < workers_amount) {
    addWorker();
  }
}


// starts worker app
function startWorker() {
  var status, clients, servers, options, logger, database, commander;

  status    = new events.EventEmitter();
  clients   = {plain: 0, secure: 0};
  servers   = {plain: null, secure: null};
  options   = require(CONFIG_FILE).shift();
  logger    = vbnntp.logger.createSlave(process);
  database  = vbnntp.database.create(options.database, logger);
  commander = vbnntp.commander.create(database, logger);

  // start plain server
  if (options.listen) {
    (function (bind) {
      servers.plain = vbnntp.initServer(vbnntp.nntp.Server, options, logger, database, commander);
      // start listening
      servers.plain.listen(bind.port, bind.host);
      logger.info('VBNNTP Listening on', bind);
      // monitore open connections
      servers.plain.on('connection', function (socket) {
        clients.plain++;
        socket.on('close', function () {
          clients.plain--;
          status.emit('free');
        });
      });
    }(parseListenString(options.listen)));
  }

  // start secure server
  if (options.listen_ssl) {
    (function (bind) {
      // prepare options
      options.key = options.cert = fs.readFileSync(options.pem_file);
      servers.secure = vbnntp.initServer(vbnntp.nntps.Server, options, logger, database, commander);
      // start listening
      servers.secure.listen(bind.port, bind.host);
      logger.info('VBNNTP Listening on', bind);
      // monitore open connections
      servers.secure.on('connection', function (socket) {
        clients.secure++;
        socket.on('close', function () {
          clients.secure--;
          status.emit('free');
        });
      });
    }(parseListenString(options.listen_ssl)));
  }

  process.on('message', function (cmd) {
    if (cmd.title) {
      process.title = cmd.title;
    }
  });

  process.on('message', function (cmd) {
    if (cmd.stop) {
      process.title = process.title + ' (stopping)';

      if (servers.plain) {
        servers.plain.removeAllListeners('connection');
      }

      if (servers.secure) {
        servers.secure.removeAllListeners('connection');
      }

      if (0 === clients.plain && 0 === clients.secure) {
        process.exit(1);
      }

      status.on('free', function () {
        if (0 === clients.plain && 0 === clients.secure) {
          process.exit(0);
        }
      });
    }
  });

  process.on('uncaughtException', function (err) {
    logger.error('Unexpected exception: ' + (err.message || err.toString()));
    process.exit(1);
  });
}


cluster.isMaster ? startMaster() : startWorker();


////////////////////////////////////////////////////////////////////////////////
// vim:ts=2:sw=2
////////////////////////////////////////////////////////////////////////////////
