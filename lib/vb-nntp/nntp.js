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


// Status code to message. See nntp.status
var STATUS_CODE = {};


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
  this.data = trim(data)
  this.action = trim(this.data.split(' ', 1).shift());
  this.params = trim(this.data.slice(this.action.length));
}


function Response(socket, request) {
  events.EventEmitter.call(this);

  this._data = '';
  this._socket = socket;
  this.request = request;
}

inherits(Response, events.EventEmitter);


Response.prototype.write = function (data) {
  this._data += (Array.isArray(data) ? data.join(CRLF) : data) + CRLF;
  return this;
};


Response.prototype.status = function (code, message) {
  if (message) {
    this.write([code, message].join(' '));
  } else if (STATUS_CODE[code]) {
    this.write([code, STATUS_CODE[code]].join(' '));
  } else {
    this.write(code);
  }

  return this;
};


Response.prototype.end = function () {
  if (0 < arguments.length) {
    if (+arguments[0] === arguments[0]) {
      // res.end(code, message)
      this.status(arguments[0], arguments[1]);
    } else {
      // res.end(data);
      this.write(arguments[0]);
    }
  }

  // send data to the socket
  if (this._socket && this._socket.writable) {
    this._socket.write(this._data);
  }

  // purge request object
  purge(this.request);
  purge(this);
};


function connectionListener(socket) {
  var self = this,
      session = {};

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
        response = new Response(socket, request);

    // we don't need to pass to commander QUIT action - it's mandatory,
    // have no parmeters and it's response is hardcoded by rfc (see 5.4)
    if ('QUIT' === request.action) {
      if ('' === request.params) {
        response.end(205);
        socket.end();
        return;
      }

      response.end(501);
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


module.exports.status = function (code, message) {
  STATUS_CODE[+code] = message;
  return +code;
};


////////////////////////////////////////////////////////////////////////////////
// vim:ts=2:sw=2
////////////////////////////////////////////////////////////////////////////////
