/**
 *  VBNNTP - Secure Server
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


var tls = require('tls'),
    inherits = require('util').inherits,
    nntp = require('./nntp');


function Server(options) {
  if (!(this instanceof Server)) { return new Server(options); }
  tls.Server.call(this, options, nntp._connectionListener);
}

inherits(Server, tls.Server);
module.exports.Server = Server;


Server.prototype.listen = nntp._wrapListen(tls.Server.prototype.listen);


////////////////////////////////////////////////////////////////////////////////
// vim:ts=2:sw=2
////////////////////////////////////////////////////////////////////////////////
