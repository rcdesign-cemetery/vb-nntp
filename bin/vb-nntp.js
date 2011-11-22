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
    vbnntp = require('../lib/vb-nntp'),
    common = require('../lib/vb-nntp/common');


var CONFIG_FILE = require('fs').realpathSync() + '/config.yml';


// MASTER
////////////////////////////////////////////////////////////////////////////////


function startMaster() {
  var options = require(CONFIG_FILE).shift(),
      ps_title = options.title || 'vbnntp',
      workers_amount = +options.workers || require('os').cpus().length,
      logger = vbnntp.logger.create(options.logger),
      workers = [];

  // forks, configures and pushes new worker into the `workers` stack
  function addWorker() {
    var worker = cluster.fork();

    vbnntp.logger.listenSlaveLogger(worker, logger);
    workers.push(worker);

    logger.info('VBNNTP Worker added', {idx: workers.length, pid: worker.pid});
    worker.send({title: ps_title + ' [worker:' + workers.length + ']'});
  }

  // --[ master events ]--------------------------------------------------------

  // when one of the workers dies, master get notifications with `death` event
  cluster.on('death', function (worker) {
    var idx = workers.indexOf(worker);;

    // when existing (in the `workers` stack) worker dies - restart
    if (0 <= idx) {
      logger.warn('VBNNTP Worker ' + worker.pid + ' died. Restarting...');
      delete workers[idx];
      // do not storm with worer recreation
      setTimeout(addWorker, 1000);
      return;
    }

    // not in the workers list (old worker) - let it go...
    logger.info('VBNNTP Worker ' + worker.pid + ' stopped.');
  });

  // soft-restart all workers
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

  // kill all workers and master
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

  // restart logger
  process.on('SIGUSR1', function () {
    logger.info('VBNNTP Restarting logger');
    logger.restart();
    logger.info('VBNNTP Logger restarted');
  });

  // softly stop all workers and then kill em all with master
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

  // something went wrong - report error
  process.on('uncaughtException', function (err) {
    logger.error('Unexpected exception: ' + common.dumpError(err));
  });

  // --[ start initial workers ]------------------------------------------------

  process.title = ps_title;
  logger.info('VBNNTP Master started', {pid: process.pid});

  while (workers.length < workers_amount) {
    addWorker();
  }
}


// WORKER
////////////////////////////////////////////////////////////////////////////////


function startWorker() {
  var status, clients, servers, options, logger, database, commander;

  status    = new events.EventEmitter();
  clients   = {plain: 0, secure: 0};
  servers   = {plain: null, secure: null};
  options   = require(CONFIG_FILE).shift();
  logger    = vbnntp.logger.createSlaveLogger(process, options.logger.severity);
  database  = vbnntp.database.create(options.database, logger);
  commander = vbnntp.commander.create(database, logger);

  // start plain server
  if (options.listen) {
    (function (bind) {
      servers.plain = vbnntp.initServer(vbnntp.nntp.Server, options, logger, database, commander);
      // start listening
      servers.plain.listen(bind.port, bind.address);
      logger.info('VBNNTP Listening on', bind);
      // monitore open connections
      servers.plain.on('connection', function (socket) {
        clients.plain++;
        socket.on('close', function () {
          clients.plain--;
          status.emit('free');
        });
      });
    }(common.parseListenString(options.listen)));
  }

  // start secure server
  if (options.listen_ssl) {
    (function (bind) {
      // prepare options
      options.key = options.cert = fs.readFileSync(options.pem_file);
      servers.secure = vbnntp.initServer(vbnntp.nntps.Server, options, logger, database, commander);
      // start listening
      servers.secure.listen(bind.port, bind.address);
      logger.info('VBNNTP Listening on', bind);
      // monitore open connections
      servers.secure.on('connection', function (socket) {
        clients.secure++;
        socket.on('close', function () {
          clients.secure--;
          status.emit('free');
        });
      });
    }(common.parseListenString(options.listen_ssl)));
  }

  // --[ worker events ]--------------------------------------------------------

  // got message from master
  process.on('message', function (cmd) {
    if (cmd.title) {
      process.title = cmd.title;
    } else if (cmd.stop) {
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

  // got unhandled exception. report and terminate worker (it will be restrted
  // by master process.
  process.on('uncaughtException', function (err) {
    logger.error('Unexpected exception: ' + common.dumpError(err));
    process.exit(1);
  });
}


////////////////////////////////////////////////////////////////////////////////


cluster.isMaster ? startMaster() : startWorker();


////////////////////////////////////////////////////////////////////////////////
// vim:ts=2:sw=2
////////////////////////////////////////////////////////////////////////////////
