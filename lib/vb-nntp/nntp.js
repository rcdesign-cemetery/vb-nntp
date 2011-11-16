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
    events = require('events'),
    inherits = require('util').inherits;


var CRLF = '\r\n';


function purge(obj) {
  var undef;
  Object.getOwnPropertyNames(obj).forEach(function (key) {
    obj[key] = undef;
  });
}


function trim(str) {
  return str.replace(trim.regexp, '');
}

// precompiled regexp
trim.regexp = /^[\r\n\s]+|[\r\n\s]+$/g;


function Request(data, session) {
  this.session = session;
  this.data = data;
  this.action = trim(data.slice(0, data.indexOf(' '))).toUpperCase();
  this.params = trim(data.slice(this.action.length));
}


function Response(request, write) {
  events.EventEmitter.call(this);
  this.request = request;
  this.on('write', write);
}

inherits(Response, events.EventEmitter);


Response.prototype.write = function (data) {
  this.emit('write', data);
  return this;
};


Response.prototype.end = function (data) {
  if (undefined !== data) {
    this.write(data);
  }

  purge(this.request);
  purge(this);
};


function connectionListener(socket) {
  var self = this,
      session = {};

  function write(data) {
    if (Array.isArray(data)) {
      data = data.join(CRLF);
    }

    socket.write(data + CRLF);
  }

  socket.setNoDelay();
  socket.setEncoding('utf8');
  socket.setTimeout(this.connectionTimeout || 60*1000);

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
  self.emit('nntp:connect', socket, session);

  socket.on('data', function (data) {
    var request = new Request(data, session),
        response = new Response(request, write);

    // we don't need to pass to commander QUIT action - it's mandatory,
    // have no parmeters and it's response is hardcoded by rfc (see 5.4)
    if ('QUIT' === request.action) {
      if ('' !== request.params) {
        write('501 Syntax Error');
      } else {
        write('205 Connection closing');
        socket.end();
      }

      purge(request);
      purge(response);
      return;
    }

    self.emit('nntp:request', request, response);
  });
}

module.exports._connectionListener = connectionListener;


function Server(options) {
  if (!(this instanceof Server)) { return new Server(options); }
  net.Server.call(this, options || {}, connectionListener);
}

inherits(Server, net.Server);
module.exports.Server = Server;


////////////////////////////////////////////////////////////////////////////////
// vim:ts=2:sw=2
////////////////////////////////////////////////////////////////////////////////
