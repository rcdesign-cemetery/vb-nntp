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


function Request(data, session) {
  this.session = session;
  this.rawData = data.toString().trim();
  this.action = this.rawData.split(' ', 1).shift();
  this.params = this.rawData.slice(this.action.length).trim();
}


function Response(socket) {
  events.EventEmitter.call(this);

  this._data = '';
  this._socket = socket;
}

inherits(Response, events.EventEmitter);


Response.prototype.write = function (data) {
  this._data += (Array.isArray(data) ? data.join(CRLF) : data) + CRLF;
  return this;
};


Response.prototype.end = function (data) {
  if (data) {
    this.write(data);
  }

  // send data to the socket
  this._socket.write(this._data);
};


function connectionListener(socket) {
  var self = this,
      session = {};

  socket.setNoDelay();
  socket.setEncoding('utf8');
  socket.setTimeout(this.connectionTimeout || 60*1000);

  // notify listeners about new session
  self.emit('nntp:connect', socket, session);

  // Close connection on long idle
  socket.on('timeout', function () {
    socket.destroy();
  });

  // Catch error, if client terminates connection during reply
  socket.on('error', function () {
    socket.destroy();
  });

  // Destroy session on close
  socket.on('close', function () {
    // what we need to do here?
  });

  socket.on('data', function (data) {
    var request = new Request(data, session),
        response = new Response(socket);

    // we don't need to pass to commander QUIT action - it's mandatory,
    // have no parmeters and it's response is hardcoded by rfc (see 5.4)
    if ('QUIT' === request.action) {
      if ('' === request.params) {
        response.end('205 Closing connection - Goodbye');
        socket.end();
        return;
      }

      response.end('501 Command syntax error');
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
