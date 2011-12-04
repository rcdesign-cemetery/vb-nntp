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


// Server factory. Creates and configures new instance of `Server`.
module.exports.initServer = function (Server, options, logger, initDatabase, commander) {
  var server = new Server(options);

  // preset server settings
  server.connectionTimeout = (+options.timeout || 15) * 1000;
  server.maxConnections    = +options.max_conn || 50;

  server.on('nntp:connect', function (socket, session) {
    var database;
    
    try {
      database = initDatabase();
    } catch (err) {
      socket.emit('error', err);
      return;
    }

    session.ip = socket.remoteAddress;
    session.database = database;
    session.vbconfig = options.vbconfig;

    // close connection on socket close
    socket.on('close', function () {
      database.destroy();
    });

    // prefill session
    session.current     = ''; // currently selected group name
    session.first       = 0;  // first msg id in current group
    session.last        = 0;  // last msg id in current group
    session.userid      = 0;
    session.username    = '';
    session.css         = {};
    session.menu        = {};
    session.template    = {};
    session.groups      = {};
    session.grp_ids     = {};

    logger.debug('SERVER new session from', {ip: session.ip});
    socket.write("201 server ready - no posting allowed\r\n");
  });

  server.on('nntp:request', function (request, response) {
    logger.debug('SERVER got command from',
                 {ip: request.session.ip, request: '"' + request.rawData + '"'});
    commander.execute(request, response);
  });

  return server;
};


////////////////////////////////////////////////////////////////////////////////
// vim:ts=2:sw=2
////////////////////////////////////////////////////////////////////////////////
