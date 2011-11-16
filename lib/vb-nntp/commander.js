/**
 *  VBNNTP - Commander
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


var crypto = require('crypto');


// hash of action => regexp, handler pairs
var COMMANDS = {};


var Commander = module.exports = function Commander(database, logger) {
  this.database = database;
  this.logger = logger;

  this.logger.debug('COMMANDER init', {available_commands: Object.keys(COMMANDS)});
};


Commander.prototype.cmdHelp = function (req, res) {
  // add help messages?
  res.end(['100 help text follows', '.']);
};


// 2 -> 02
function pad(n) {
  return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


Commander.prototype.cmdDate = function (req, res) {
  var now = new Date();
  res.end(
    '111 ' +
    now.getUTCFullYear() +
    pad(now.getUTCMonth()+1) +
    pad(now.getUTCDate()) +
    pad(now.getUTCHours()) +
    pad(now.getUTCMinutes()) +
    pad(now.getUTCSeconds())
  );
};


Commander.prototype.cmdMode = function (req, res) {
  res.end('201 server ready - no posting allowed');
};


Commander.prototype.cmdAuthInfo = function (req, res) {
  var self = this, meta;

  if (req.session.userid) {
    res.end('502 Command unavailable');
    return;
  }

  if ('USER' === req.matches[1].toUpperCase()) {
    req.session.username = req.matches[2];
    res.end('381 More authentication information required');
    return;
  }

  // else arg = PASS
  if (!req.session.username) {
    res.end('482 Authentication commands issued out of sequence');
    return;
  }

  meta = {username: req.session.username};
  req.session.password = crypto.createHash('md5').update(req.matches[2]).digest("hex");

  self.logger.debug('AUTHINFO Authenticating user', meta);
  self.database.checkAuth(req.session, function (err, verified, bruteforce) {
    if (err) {
      meta.error = err.message || err.toString();
      self.logger.error('AUTHINFO Error', meta);
      res.end('403 Internal fault');
      return;
    }

    if (verified) {
      self.logger.notice('AUTHINFO Authentication success', meta);
      res.end('281 Authentication accepted');
      return;
    }

    if (bruteforce) {
      self.logger.warn('AUTHINFO Brute force deteted', meta);
      res.end('481 Authentication rejected (too many attempts)');
      return;
    }

    self.logger.notice('AUTHINFO Authentication failed', meta);
    res.end('481 Authentication rejected');
  });
};


Commander.create = function (database, logger) {
  return new Commander(database, logger);
};


Commander.prototype.execute = function (req, res) {
  var meta = {action: req.action, params: req.params};

  this.logger.debug('COMMANDER execute', meta);

  if (undefined === COMMANDS[req.action]) {
    this.logger.warn('COMMANDER command not found', meta);
    res.end('500 command not recognized');
    return;
  }

  req.matches = COMMANDS[req.action].regexp.exec(req.params);
  if (req.matches) {
    COMMANDS[req.action].handler.call(this, req, res);
    return;
  }

  meta.expected = COMMANDS[req.action].regexp.source;
  this.logger.warn('COMMANDER invalid syntax', meta);
  res.end('501 command syntax error');
};



COMMANDS['HELP'] = {regexp: /^$/, handler: Commander.prototype.cmdHelp};
COMMANDS['DATE'] = {regexp: /^$/, handler: Commander.prototype.cmdDate};
COMMANDS['MODE'] = {regexp: /^READER$/i, handler: Commander.prototype.cmdMode};
COMMANDS['AUTHINFO'] = {regexp: /^(USER|PASS)\s+(.+)$/i,
                        handler: Commander.prototype.cmdAuthInfo};


////////////////////////////////////////////////////////////////////////////////
// vim:ts=2:sw=2
////////////////////////////////////////////////////////////////////////////////
