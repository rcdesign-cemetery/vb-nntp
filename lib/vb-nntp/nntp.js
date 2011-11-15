var net = require('net'),
    util = require('util'),
    session = require('./session');


var CRLF = '\r\n';
var debug = (process.env.NODE_DEBUG && /nntp/.test(process.env.NODE_DEBUG))
          ? function () { console.error('NNTP: %s', arguments[0]); }
          : function () {};


function Request(data, session) {
  this.session = session;
  this.command = data.slice(0, data.indexOf(' '));
  this.params = data.slice(data.indexOf(' ') + 1);
}


Request.prototype.destroy = function () {
  this.session = null;
};


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
      session = new Session(socket);

  debug('SERVER new nntp connection');

  socket.setNoDelay();
  socket.setEncoding('utf8');
  socket.setTimeout(this.connectionTimeout || 60*1000);
  socket.write("201 server ready - no posting allowed" + CRLF);

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
    session = undef;
  });

  socket.on('data', function (data) {
    var req = new Request(data, session),
        res = new Response(socket, req);

    self.commandProcessor(req, res);
  });
}

module.exports._connectionListener = connectionListener;

function Server(options) {
  if (!(this instanceof Server)) { return new Server(options); }
  net.Server.call(this, options || {}, connectionListener);
}

util.inherits(Server, net.Server);
module.exports.Server = Server;

////////////////////////////////////////////////////////////////////////////////
// vim:ts=2:sw=2
////////////////////////////////////////////////////////////////////////////////
