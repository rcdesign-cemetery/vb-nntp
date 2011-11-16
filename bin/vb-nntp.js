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
      logger = vbnntp.logger.create(options.logger);

  var worker = cluster.fork();
  vbnntp.logger.attachLogger(worker, logger);
}


// starts worker app
function startWorker() {
  var options, logger, database, commander, servers;

  servers   = [];
  options   = require(CONFIG_FILE).shift();
  logger    = vbnntp.logger.createSlave(process);
  database  = vbnntp.database.create(options.database);
  commander = vbnntp.commander.create(database, logger);

  // start plain server
  if (options.listen) {
    (function (bind) {
      var server = vbnntp.initServer(vbnntp.nntp.Server, options, logger, database, commander);
      servers.push(server.listen(bind.port, bind.host));
      logger.info('SERVER Listening on', bind);
    }(parseListenString(options.listen)));
  }

  // start secure server
  if (options.listen_ssl) {
    (function (bind) {
      // prepare options
      options.key = options.cert = fs.readFileSync(options.pem_file);
      var server = vbnntp.initServer(vbnntp.nntps.Server, options, logger, database, commander);
      servers.push(server.listen(bind.port, bind.host));
      logger.info('SERVER Listening on', bind);
    }(parseListenString(options.listen_ssl)));
  }
}


cluster.isMaster ? startMaster() : startWorker();


////////////////////////////////////////////////////////////////////////////////
// vim:ts=2:sw=2
////////////////////////////////////////////////////////////////////////////////
