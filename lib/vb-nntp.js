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
  server.connectionTimeout = (+options.timeout || 2*60) * 1000;
  server.maxConnections    = +options.max_conn || 50;

  server.on('nntp:connect', function (socket, session) {
    session.ip = socket.remoteAddress;
    logger.debug('VBNNTP new session from', {ip: session.ip});
    socket.write("201 server ready - no posting allowed\r\n");
  });

  server.on('nntp:request', function (request, response) {
    logger.debug('VBNNTP got command from', {ip: request.session.ip});
    commander.execute(request, response);
  });

  return server;
}


////////////////////////////////////////////////////////////////////////////////
// vim:ts=2:sw=2
////////////////////////////////////////////////////////////////////////////////
