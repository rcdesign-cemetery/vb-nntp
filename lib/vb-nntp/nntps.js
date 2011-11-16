var tls = require('tls'),
    inherits = require('util').inherits,
    nntp = require('./nntp');


function Server(options) {
  if (!(this instanceof Server)) { return new Server(options); }
  tls.Server.call(this, options, nntp._connectionListener);
}

inherits(Server, tls.Server);
module.exports.Server = Server;


Server.prototype.logger = require('./logger').dummy;


////////////////////////////////////////////////////////////////////////////////
// vim:ts=2:sw=2
////////////////////////////////////////////////////////////////////////////////
