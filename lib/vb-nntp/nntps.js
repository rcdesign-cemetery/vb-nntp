var tls = require('tls'),
    util = require('util'),
    nntp = require('./nntp');


function Server(options) {
  if (!(this instanceof Server)) { return new Server(options); }
  tls.Server.call(this, options, nntp._connectionListener);
}

util.inherits(Server, tls.Server);
module.exports.Server = Server;


////////////////////////////////////////////////////////////////////////////////
// vim:ts=2:sw=2
////////////////////////////////////////////////////////////////////////////////
