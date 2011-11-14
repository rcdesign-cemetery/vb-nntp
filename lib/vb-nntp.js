var Server = require('./vb-nntp/server'),
    Logger = require('./vb-nntp/logger'),
    Database = require('./vb-nntp/database');


var VBNNTP = module.exports = function VBNNTP(options) {
  Server.call(this);
};


inherits(VBNNTP, Server);


VBNNTP.commandHandlers = {};
VBNNTP.addCommand = Server.addCommand;


VBNNTP.prototype.handleArticle = function handleArticle(req, res) {
  res.end(220, headers, body);
};


VBNNTP.addCommand('ARTICLE', /^ARTICLE (.+)$/, VBNNTP.prototype.handleArticle);



////////////////////////////////////////////////////////////////////////////////
// vim:ts=2:sw=2
////////////////////////////////////////////////////////////////////////////////
