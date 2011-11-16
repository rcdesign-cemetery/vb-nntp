/**
 *  VBNNTP - Server
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


var net = require('net'),
    inherits = require('util').inherits;


var CRLF = '\r\n';


function purge(session) {
  Object.keys(session).forEach(function (key) {
    session[key] = null;
  });
}


function Request(data, session) {
  this.session = session;
  this.command = data.slice(0, data.indexOf(' '));
  this.params = data.slice(data.indexOf(' ') + 1);
}


function Response(socket, req) {
  this.socket = socket;
  this.req = req;
}


Response.prototype.write = function (data) {
  if (Array.isArray(data)) {
    data = data.join(CRLF);
  }

  this.socket.write(data + CRLF);
};


Response.prototype.end = function (data) {
  if (undefined !== data) {
    this.write(data);
  }

  this.req = null;
  this.socket = null;
};


function connectionListener(socket) {
  var self = this,
      session = {};

  socket.setNoDelay();
  socket.setEncoding('utf8');
  socket.setTimeout(this.connectionTimeout || 60*1000);
  socket.write("201 server ready - no posting allowed" + CRLF);

  // Close connection on long idle
  socket.on('timeout', function () {
    purge(session);
    socket.destroy();
  });

  // Catch error, if client terminates connection during reply
  socket.on('error', function () {
    purge(session);
    socket.destroy();
  });

  // Destroy session on close
  socket.on('close', function () {
    purge(session);
    session = null;
  });

  // notify listeners about new session
  self.emit('nntp:session', session);

  socket.on('data', function (data) {
    var req = new Request(data, session),
        res = new Response(req);

    self.emit('nntp:command', socket, req, res);
  });
}

module.exports._connectionListener = connectionListener;


function wrapListen(superListen) {
  return function listen(binding) {
    if ('string' === typeof binding && /:/.test(binding)) {
      binding = binding.split(':');
      return superListen.call(this, +binding[1], binding[0]);
    }

    return superListen.apply(this, arguments);
  };
}

module.exports._wrapListen = wrapListen;


function Server(options) {
  if (!(this instanceof Server)) { return new Server(options); }
  net.Server.call(this, options || {}, connectionListener);
}

inherits(Server, net.Server);
module.exports.Server = Server;

Server.prototype.listen = wrapListen(net.Server.prototype.listen);


////////////////////////////////////////////////////////////////////////////////
// vim:ts=2:sw=2
////////////////////////////////////////////////////////////////////////////////
