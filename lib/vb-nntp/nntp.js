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
var noop = function () {};


// INTERNALS ///////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////


// request instance, contains:
//   * session - reference to session hash created for socket upon connection
//   * rawData - original request (trimmed), e.g. `FOOBAR 123 456`
//   * action  - command action (uppercase), e.g. `FOOBAR`
//   * params  - command params, e.g. `123 456`
function Request(data, session) {
  this.session = session;
  this.rawData = data.toString().trim();
  this.action = this.rawData.split(' ', 1).shift();
  this.params = this.rawData.slice(this.action.length).trim();
}


function Response(socket) {
  this._data = '';
  this._socket = socket;
}


// writes given data into internal cache.
// actual writing to socket is performed by `end()`
Response.prototype.write = function (data) {
  this._data += (Array.isArray(data) ? data.join(CRLF) : data) + CRLF;
  return this;
};


// sends internal data buffer to the soket
// if `data` is given, calls `res.write()` before (syntax sugar).
Response.prototype.end = function (data) {
  if (data) {
    this.write(data);
  }

  // normally we don't need this extra-check - node.js (net) cares about it,
  // but tls does not and throws exception, see:
  // https://github.com/joyent/node/issues/2315
  if (this._socket && this._socket.writable) {
    // send data to the socket
    this._socket.write(this._data);
  }

  this._data = '';
};


// listens new connections, prepares sockets to be served by handlers.
// upon connection emits event `nntp:connection` with `socket, session`.
// upon command request emits `nntp:request` with `request, response`
function connectionListener(socket) {
  var self = this,
      session = {};

  socket.setNoDelay();
  socket.setEncoding('utf8');
  socket.setTimeout(this.connectionTimeout || 60*1000);

  // notify listeners about new session
  self.emit('nntp:connect', socket, session);

  // destroy connection on timeout
  socket.on('timeout', function () {
    socket.destroy();
  });

  // if client closed connection and we tried to write. do nothing in fact.
  socket.on('error', noop);

  // socket closed. and we still don't care
  socket.on('close', noop);

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


// expose connectionListener to be used by nttps (secure) server
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
