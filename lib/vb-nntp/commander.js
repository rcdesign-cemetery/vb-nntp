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


// require modules
var crypto = require('crypto');


// hash of commands (actions => [{regexp, handlers}, ...])
var COMMANDS = {};


// TODO:  Completely rewrite the way we work with buffers. Curent implementation
//        wastes memory useless.


// UTILITIES
////////////////////////////////////////////////////////////////////////////////


var buf = new Buffer(65535);


/**
 * Prepends `str` with `char` until given `len` of the string.
 */
function padLeft(len, char, str) {
  str += ''; // force stringification
  while (len < str.length) {
    str = char + str;
  }
  return str;
}


/**
 * Unescapes HTML string
 */
function unescapeHTML(str) {
  if (0 === str.length) {
    return '';
  }

  return str.replace(/&amp;/g,'&').replace(/&gt;/g,'>')
            .replace(/&lt;/g,'<').replace(/&quot;/g,'"');
}


/**
 * Build message "Subject" (UTF-8, Base64 encoding)
 */      
function msgSubject(subject) {
  return '=?UTF-8?B?' +
         buf.toString('base64', 0, buf.write(unescapeHTML(subject), 0)) +
         '?=';
}


/**
 * Build message field "From" (UTF-8, Base64 encoding)
 */          
function msgFrom(username) {
  return '=?UTF-8?B?' +
         buf.toString('base64', 0, buf.write(unescapeHTML(username), 0)) +
         '?= <no_reply@rcdesign.ru>';
}


// adds stack of command handlers
function addCommand(action, regexp, handler) {
  if (undefined === COMMANDS[action]) {
    COMMANDS[action] = [];
  }

  COMMANDS[action].push({
    regexp: regexp,
    handlers: Array.prototype.slice.call(arguments, 2)
  });
}


function executeHandlersChain(handlers, req, res) {
  var self = this, next;

  // make handlers copy
  handlers = handlers.slice();

  next = function (err) {
    var curr = handlers.shift();

    self.logger.verbose('COMMANDER ...', {
      got_handler: (undefined !== curr),
      handlers_left: handlers.length
    });

    if (!err && !curr) {
      err = new Error("No more handlers in the chain");
    }

    if (err) {
      self.logger.warn('COMMANDER Failed execute chain',
                       {err: err.message || err.toString()});
      res.end(403);
      return;
    }

    res.once('next', next);
    curr.call(self, req, res);
  }

  next();
}


// REQUEST-DEPENDANT FUNCTIONS
////////////////////////////////////////////////////////////////////////////////


/**
 * Build message id string as "<messageid>@<gateid>"
 * Example: "5902@example.com"
 */
function msgIdString(req, msgId, msgType) {
  return '<' + msgId + '.' + msgType + '@' + req.session.vbconfig.forum_host + '>';
}


/**
 * Build reference id string as "<referenceid>.ref@<gateid>"
 * Example: "120.ref@example.com"
 */
function msgReferers(req, refererId, msgType) {
  return '<' +refererId + '.' + msgType + '.ref@' + req.session.vbconfig.forum_host + '>';
}


/**
 * Build message field Xref
 * Example: your.nntp.com cool.sex.binary:3748
 */      
function msgXRef(req, group, msgId) {
  return 'Xref: ' + req.session.vbconfig.forum_host + " " + group + ':' + msgId;
}


// MODULE CONSTRUCTOR
////////////////////////////////////////////////////////////////////////////////


/**
 * Class constructor
 */
var Commander = module.exports = function Commander(database, logger) {
  this.database = database;
  this.logger = logger;

  this.logger.debug('COMMANDER init', {available_commands: Object.keys(COMMANDS)});
};


/**
 * Proxy to constructor
 */
Commander.create = function (database, logger) {
  return new Commander(database, logger);
};


/**
 * Executes given request.
 */
Commander.prototype.execute = function (req, res) {
  var self = this,
      meta = {action: req.action, params: req.params},
      stack = COMMANDS[req.action],
      command, matches;

  this.logger.verbose('COMMANDER execute', meta);

  if (undefined === stack) {
    this.logger.warn('COMMANDER command not found', meta);
    res.end(500);
    return;
  }

  if (0 === stack.length) {
    this.logger.warn('COMMANDER Empty command stack detected', meta);
    res.end(403);
    return;
  }

  stack = stack.slice(); // clone the stack
  while (stack.length) {
    command = stack.shift();
    matches = command.regexp.exec(req.params);

    if (matches) {
      self.logger.debug('COMMANDER Processing handlers chain',
                        {length: command.handlers.length});

      req.params = matches;
      executeHandlersChain.call(self, command.handlers, req, res);
      return;
    }
  }

  this.logger.warn('COMMANDER invalid syntax', meta);
  res.end(501);
};


// COMMAND HANDLERS
////////////////////////////////////////////////////////////////////////////////


Commander.prototype.cmdHelp = function (req, res) {
  res.status(100).write('.').end();
};


Commander.prototype.cmdDate = function (req, res) {
  var now = new Date();
  res.status(111, now.getUTCFullYear() +
                  padLeft(2, '0', now.getUTCMonth() + 1) +
                  padLeft(2, '0', now.getUTCDate()) +
                  padLeft(2, '0', now.getUTCHours()) +
                  padLeft(2, '0', now.getUTCMinutes()) +
                  padLeft(2, '0', now.getUTCSeconds())
  ).end();
};


Commander.prototype.cmdMode = function (req, res) {
  res.end(201);
};


Commander.prototype.cmdAuthInfo = function (req, res) {
  var self = this, meta;

  if (req.session.userid) {
    res.end(502);
    return;
  }

  if ('USER' === req.params[1].toUpperCase()) {
    req.session.username = req.params[2];
    res.end(381);
    return;
  }

  // else arg = PASS
  if (!req.session.username) {
    res.end(482);
    return;
  }

  meta = {username: req.session.username};
  req.session.password = crypto.createHash('md5').update(req.params[2]).digest("hex");

  self.logger.debug('AUTHINFO Authenticating user', meta);
  self.database.checkAuth(req.session, function (err, verified, bruteforce) {
    if (err) {
      meta.error = err.message || err.toString();
      self.logger.error('AUTHINFO Error', meta);
      res.end(403);
      return;
    }

    if (verified) {
      self.logger.notice('AUTHINFO Authentication success', meta);
      res.end(281);
      return;
    }

    if (bruteforce) {
      self.logger.warn('AUTHINFO Brute force deteted', meta);
      res.status(481, 'Authentication rejected (too many attempts)').end();
      return;
    }

    self.logger.notice('AUTHINFO Authentication failed', meta);
    res.end(481);
  });
};


Commander.prototype.requiresAuthentication = function (req, res) {
  if (req.session.userid) {
    res.emit('next');
    return;
  }

  res.end(480);
};


Commander.prototype.requiresVbulletinConfig = function (req, res) {
  if (!req.session.vbconfig) {
    this.database.getVbulletinConfig(function (err, config) {
      if (err) {
        res.emit('next', err);
        return;
      }

      req.session.vbconfig = config;
      res.emit('next');
    });
    return;
  }

  res.emit('next');
};


Commander.prototype.cmdList = function (req, res) {
  this.database.getGroupsStat(req.session.grp_ids, function (err, rows) {
    var groups = req.session.groups;

    if (err) {
      res.emit('next', err);
      return;
    }

    if (!groups) {
      res.emit('next', new Error("cmdList() expects session to have groups"));
      return;
    }

    res.status(215);
    Object.getOwnPropertyNames(req.session.groups).forEach(function (name) {
      var parts = [name, 0, 0, 'n'];
      // I have concerns about results from db-mysql and libmysql difference
      // TODO: Check this call
      if (rows[groups[name]]) {
        parts[1] = rows[groups[name]].last || 0;
        parts[2] = rows[groups[name]].first || 0;
      }
      res.write(parts.join(' '));
    });
    res.end('.');
  });
};


Commander.prototype.cmdNewGroups = function (req, res) {
  var d = req.params[1], t = req.params[2],
      dt = [d.slice(0, -4), d.slice(-4, -2), d.slice(-2)].join('-') + ' ' +
           [t.slice(0, -4), t.slice(-4, -2), d.slice(-2)].join(':');

  this.database.getNewGroups(req.session.grp_ids, dt, function (err, rows) {
    if (err) {
      res.emit('next', err);
      return;
    }

    res.write(231);
    Object.getOwnPropertyNames(req.session.groups).forEach(function (name) {
      var id = req.session.groups[name];
      if (!!rows[id]) {
        res.write([name, rows[id].last, rows[id].first, 'n'].join(' '));
      }
    });
    res.end('.');
  });
};


Commander.prototype.cmdGroup = function (req, res) {
  var group_id = req.session.groups[req.params[1]];

  if (!group_id) {
    res.end(411);
    return;
  }

  this.database.getGroupInfo(group_id, function (err, info) {
    var first, last, total;

    if (err) {
      res.emit('next', err);
      return;
    }

    if (!!info) {
      first = info.first || 0;
      last = info.last || 0;
      total = info.total || 0;
    } else {
      first = last = total = 0;
    }

    req.session.current = req.params[1];
    req.session.first = first;
    req.session.last = last;

    res.end(211, [total, first, last, req.params[1]].join(' '));
  });
};


Commander.prototype.cmdListGroup = function (req, res) {
  var self = this,
      group = req.params[1],
      group_id = req.session.groups[group];

  if (!group_id) {
    res.end(411);
    return;
  }

  this.database.getGroupInfo(group_id, function (err, info) {
    var first, last, total;

    if (err) {
      res.emit('next', err);
      return;
    }

    if (!!info) {
      first = info.first || 0;
      last = info.last || 0;
      total = info.total || 0;
    } else {
      first = last = total = 0;
    }

    // We can use more effective request, to get ids only. But who cares?
    // Command is quire rare, no need to optimize now.
    self.database.getHeaders(group_id, first, last, function(err, hdrs) {
      if (err) {
        res.emit('next', err);
        return;
      }

      res.status(211, [total, first, last, group, 'list follows'].join(' '));
      hdrs.forEach(function (hdr) {
        res.write(hdr.messageid);
      });
      res.end('.');
    });
  });
};


Commander.prototype.cmdXOver = function (req, res) {
  var group_id, range_min, range_max;

  if (!req.session.current) {
    res.end(412);
    return;
  }

  if (!req.params[1]) {
    res.end(420);
    return;
  }

  group_id = req.session.groups[req.session.current];
  range_min = +req.params[2];
  range_max = !!req.params[3] ? (+req.params[4] || req.session.last) : range_min;

  this.database.getHeaders(group_id, range_min, range_max, function (err, hdrs) {
    if (err) {
      res.emit('next', err);
      return;
    }

    if (!hdrs.length) {
      res.end(423);
      return;
    }

    res.status(224);
    hdrs.forEach(function (hdr) {
      res.write([
        hdr.messageid,
        msgSubject(hdr.title),
        msgFrom(hdr.username),
        hdr.gmdate,
        msgIdString(req, hdr.postid, hdr.messagetype),
        msgReferers(req, hdr.refid, hdr.messagetype),
        '',
        msgXRef(req, req.session.current, hdr.messageid)
      ].join('\t'));
    });
    res.end('.');
  });
};


var XHDR_FORMAT = {
  'FROM':       function (req, hdr) { return [hdr.messageid, msgFrom(hdr.username)]; },
  'SUBJECT':    function (req, hdr) { return [hdr.messageid, msgSubject(hdr.title)]; },
  'MESSAGE-ID': function (req, hdr) { return [hdr.messageid, msgIdString(req, hdr.postid, hdr.messagetype)]; },
  'REFERENCES': function (req, hdr) { return [hdr.messageid, msgReferers(req, hdr.refid, hdr.messagetype)]; },
  'DATE':       function (req, hdr) { return [hdr.messageid, hdr.gmdate]; },
  '__UNDEF__':  function (req, hdr) { return [hdr.messageid]; }

};

Commander.prototype.cmdXHdr = function (req, res) {
  var group_id, range_min, range_max, formatter;

  if (!req.session.current) {
    res.end(412);
    return;
  }

  if (!req.params[2]) {
    res.end(420);
    return;
  }

  group_id = req.session.groups[req.session.current];
  range_min = +req.params[2];
  range_max = !!req.params[3] ? (+req.params[4] || req.session.last) : range_min;
  formatter = XHDR_FORMAT[req.params[1].toUpperCase()] || XHDR_FORMAT.__UNDEF__;

  this.database.getHeaders(group_id, range_min, range_max, function (err, hdrs) {
    if (err) {
      res.emit('next');
      return;
    }

    if (!hdrs.length) {
      res.end(423);
      return;
    }

    res.status(221);
    hdrs.forEach(function (hdr) {
      res.write(formatter(req, hdr).join(' '));
    });
    res.end('.');
  });
};


Commander.prototype.preloadArticle = function (req, res) {
  var self = this;

  this.database.getArticle(req.session.current, req.params[1], function (err, article) {
    if (err) {
      res.emit('next', err);
      return;
    }

    if (!article) {
      res.end(423);
      return;
    }

    req.article = article;
    res.emit('next');
  });
};


Commander.prototype.preloadArticleHead = function (req, res) {
  req.articleHead = [];

  req.articleHead.push("From: "       + msgFrom(req.article.username));
  req.articleHead.push("Newsgroups: " + req.session.current);
  req.articleHead.push("Subject: "    + msgSubject(req.article.subject));
  req.articleHead.push("Date: "       + req.article.gmdate);
  req.articleHead.push("Message-ID: " + msgIdString(req, req.article.postid, req.article.messagetype));
  req.articleHead.push("References: " + msgReferers(req, req.article.refid, req.article.messagetype));
  req.articleHead.push("Expires: "    + req.article.expires);

  req.articleHead.push("Content-Type: text/html; charset=utf-8");
  req.articleHead.push("Content-Transfer-Encoding: base64");
  req.articleHead.push("Charset: utf-8");

  req.articleHead.push(msgXRef(req, req.session.current, req.article.messageid));

  res.emit('next');
};


Commander.prototype.preloadArticleBody = function (req, res) {
  var menu, parsed, pos;

  menu = req.session.menu.split('<% POST ID %>').join(req.article.postid)
                         .split('<% THREAD ID %>').join(req.article.refid);
  parsed = req.session.template.replace('<% CSS %>', req.session.css)
                               .replace('<% USER MENU %>', menu)         
                               .replace('<% MESSAGE BODY %>', req.article.body);

  // Cut long base64 string for short peaces
  // -- DON'T -- switch to plain text without tests on production!
  // Thunderbird seems to reload all plain messages in synced groups
  // for offline. No ideas why. Base64 partly solved problem.

  parsed = buf.toString('base64', 0, buf.write(parsed, 0));

  req.articleBody = [];
  for (pos = 0; pos < parsed.length; pos += 76) {
    req.articleBody.push(parsed.slice(pos, pos + 76));
  }

  res.emit('next');
};


Commander.prototype.cmdArticle = function (req, res) {
  res.status(220);
  res.write(req.articleHead);
  res.write('');
  res.write(req.articleBody);
  res.end('.');
};


Commander.prototype.cmdHead = function (req, res) {
  res.status(221);
  res.write(req.articleHead);
  res.end('.');
};


Commander.prototype.cmdBody = function (req, res) {
  res.status(222);
  res.write(req.articleBody);
  res.end('.');
};


// FILLING COMMANDS
////////////////////////////////////////////////////////////////////////////////


addCommand('HELP',        /^$/,
                          Commander.prototype.cmdHelp);
addCommand('DATE',        /^$/,
                          Commander.prototype.cmdDate);
addCommand('MODE',        /^READER$/i,
                          Commander.prototype.cmdMode);
addCommand('AUTHINFO',    /^(USER|PASS)\s+(.+)$/i,
                          Commander.prototype.cmdAuthInfo);
addCommand('LIST',        /^$/,
                          Commander.prototype.requiresAuthentication,
                          Commander.prototype.requiresVbulletinConfig,
                          Commander.prototype.cmdList);
addCommand('NEWGROUPS',   /^(\d{6,8})\s+(\d{6})(?:\s+ GMT)?$/,
                          Commander.prototype.requiresAuthentication,
                          Commander.prototype.requiresVbulletinConfig,
                          Commander.prototype.cmdNewGroups);
addCommand('GROUP',       /^(.+)$/,
                          Commander.prototype.requiresAuthentication,
                          Commander.prototype.requiresVbulletinConfig,
                          Commander.prototype.cmdGroup);
addCommand('LISTGROUP',   /^([^\s]+)$/,
                          Commander.prototype.requiresAuthentication,
                          Commander.prototype.requiresVbulletinConfig,
                          Commander.prototype.cmdListGroup);
addCommand('XOVER',       /^((\d+)(-(\d+)?))?$/,
                          Commander.prototype.requiresAuthentication,
                          Commander.prototype.requiresVbulletinConfig,
                          Commander.prototype.cmdXOver);
addCommand('XHDR',        /^(FROM|SUBJECT|MESSAGE-ID|REFERENCES|DATE)(?:\s+(\d+)(-(\d+)?))?$/i,
                          Commander.prototype.requiresAuthentication,
                          Commander.prototype.requiresVbulletinConfig,
                          Commander.prototype.cmdXHdr);
addCommand('ARTICLE',     /^(\d+)$/,
                          Commander.prototype.requiresAuthentication,
                          Commander.prototype.requiresVbulletinConfig,
                          Commander.prototype.preloadArticle,
                          Commander.prototype.preloadArticleHead,
                          Commander.prototype.preloadArticleBody,
                          Commander.prototype.cmdArticle);
addCommand('HEAD',        /^(\d+)$/,
                          Commander.prototype.requiresAuthentication,
                          Commander.prototype.requiresVbulletinConfig,
                          Commander.prototype.preloadArticle,
                          Commander.prototype.preloadArticleHead,
                          Commander.prototype.cmdHead);
addCommand('BODY',        /^(\d+)$/,
                          Commander.prototype.requiresAuthentication,
                          Commander.prototype.requiresVbulletinConfig,
                          Commander.prototype.preloadArticle,
                          Commander.prototype.preloadArticleBody,
                          Commander.prototype.cmdBody);


////////////////////////////////////////////////////////////////////////////////
// vim:ts=2:sw=2
////////////////////////////////////////////////////////////////////////////////
