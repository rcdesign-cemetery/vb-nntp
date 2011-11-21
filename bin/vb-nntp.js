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

    logger.info('VBNNTP Worker added', {idx: workers.length, pid: worker.pid});
    worker.send({title: ps_title + ' [worker:' + workers.length + ']'});
  }

  cluster.on('death', function (worker) {
    var idx = workers.indexOf(worker);;

    if (0 <= idx) {
      logger.warn('VBNNTP Worker ' + worker.pid + ' died. Restarting...');
      delete workers[idx];
      // do not storm with worer recreation
      setTimeout(addWorker, 1000);
      return;
    }

    // not in the workers list - old worker that stopped
    logger.info('VBNNTP Worker ' + worker.pid + ' stopped.');
  });

  process.on('SIGHUP', function () {
    var old_workers = workers;

    logger.info('VBNNTP Restarting workers');

    // start new workers
    workers = [];
    while (workers.length < workers_amount) {
      addWorker();
    }

    // request old workers to stop listen new connections
    while (old_workers.length) {
      old_workers.shift().send({stop: true});
    }
  });

  process.once('SIGINT', function () {
    var worker;
    cluster.removeAllListeners('death');

    while (workers.length) {
      worker = workers.shift();

      // sometimes workers dies faster than master
      if (worker) {
        worker.kill('SIGINT');
      }

      worker = null;
    }

    process.exit(0);
  });

  process.on('SIGUSR1', function () {
    logger.info('VBNNTP Restarting logger');
    logger.restart();
    logger.info('VBNNTP Logger restarted');
  });

  process.once('SIGTERM', function () {
    var alive = workers.length;

    cluster.removeAllListeners('death');
    cluster.on('death', function () {
      alive--;

      if (0 === alive) {
        process.exit(0);
      }
    });

    while (0 < workers.length) {
      workers.shift().send({stop: true});
    }
  });

  process.on('uncaughtException', function (err) {
    logger.error('Unexpected exception: ' + (err.message || err.toString()));
  });

  process.title = ps_title;
  logger.info('VBNNTP Master started', {pid: process.pid});

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
  logger    = vbnntp.logger.createSlave(process, options.logger.severity);
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
      logger.debug('VBNNTP Stoppping worker', {pid: process.pid});
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
