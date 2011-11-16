/**
 *  VBNNTP
 *
 *  License: Creative Commons BY-NC-ND 3.0
 *           http://creativecommons.org/licenses/by-nc-nd/3.0/
 *  
 *  Author: Vitaly Puzrin <vitaly@rcdesign>
 *  Author: Aleksey V Zapparov <ixti@member.fsf.org> (http://www.ixti.net)
 *  
 *  Copyright (C) RC Design, Vitaly Puzrin
 */


'use strict';


module.exports.nntp       = require('./vb-nntp/nntp');
module.exports.nntps      = require('./vb-nntp/nntps');
module.exports.logger     = require('./vb-nntp/logger');
module.exports.database   = require('./vb-nntp/database');
module.exports.commander  = require('./vb-nntp/commander');


module.exports.initServer = function (Server, options, logger, database, commander) {
  var server = new Server(options);

  // preset server settings
  server.connectionTimeout = options.timeout;
  server.maxConnections    = options.max_conn;

  server.on('nntp:session', function (socket, session) {
    session.ip = socket.remoteAddress;
    logger.debug('new session from', {ip: session.ip});
  });

  server.on('nntp:command', function (request, response) {
    logger.debug('got command from', {ip: request.session.ip});
  });

  server.on('nntp:command', commander.processor);

  return server;
}


////////////////////////////////////////////////////////////////////////////////
// vim:ts=2:sw=2
////////////////////////////////////////////////////////////////////////////////
