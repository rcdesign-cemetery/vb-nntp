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


var COMMANDS = {};


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


// UTILITIES
////////////////////////////////////////////////////////////////////////////////

function unescapeHTML(str) {
  if (0 === str.length) {
    return '';
  }

  return str.replace(/&amp;/g,'&').replace(/&gt;/g,'>')
            .replace(/&lt;/g,'<').replace(/&quot;/g,'"');
}

// REQUEST-DEPENDANT FUNCTIONS -- fn.call(req, *args)
////////////////////////////////////////////////////////////////////////////////

var buf = new Buffer(65535);

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

/**
 * Build message id string as "<messageid>@<gateid>"
 * Example: "5902@example.com"
 */
function msgIdString(msgId, msgType) {
  return '<' + msgId + '.' + msgType + '@' + this.vbconfig.forum_host + '>';
}

/**
 * Build reference id string as "<referenceid>.ref@<gateid>"
 * Example: "120.ref@example.com"
 */
function msgReferers(refererId, msgType) {
  return '<' +refererId + '.' + msgType + '.ref@' + this.vbconfig.forum_host + '>';
}

/**
 * Build message field Xref
 * Example: your.nntp.com cool.sex.binary:3748
 */      
function msgXRef(group, msgId) {
  return 'Xref: ' + this.vbconfig.forum_host + " " + group + ':' + msgId;
}

////////////////////////////////////////////////////////////////////////////////

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

  if ('USER' === req.params[1].toUpperCase()) {
    req.session.username = req.params[2];
    res.end('381 More authentication information required');
    return;
  }

  // else arg = PASS
  if (!req.session.username) {
    res.end('482 Authentication commands issued out of sequence');
    return;
  }

  meta = {username: req.session.username};
  req.session.password = crypto.createHash('md5').update(req.params[2]).digest("hex");

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


Commander.prototype.requiresAuthentication = function (req, res) {
  if (req.session.user_id) {
    res.emit('next');
    return;
  }

  res.end('480 Authentication required');
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
  this.database.getGroupsStat(req.session, function (err, rows) {
    if (err) {
      res.end('403 internal fault');
      return;
    }

    if (!req.session.groups) {
      res.emit('next', new Error("cmdList() expects session to have groups"));
      return;
    }

    res.write('215 information follows');
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

    res.write('231 list of new newsgroups follows');
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
    res.end('411 no such news group');
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

    res.end([211, total, first, last, req.params[1]].join(' '));
  });
};


Commander.prototype.cmdListGroup = function (req, res) {
  var self = this,
      group = req.params[1],
      group_id = req.session.groups[group];

  if (!group_id) {
    res.end('411 no such news group');
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

      res.write([211, total, first, last, group, 'list follows'].join(' '));
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
    res.end('412 no newsgroup has been selected');
    return;
  }

  if (!req.params[1]) {
    res.end('420 no current article has been selected');
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
      res.end('423 no such article number in this group');
      return;
    }

    res.write('224 Overview information follows');
    hdrs.forEach(function (hdr) {
      res.write([
        hdr.messageid,
        msgSubject.call(req, hdr.title),
        msgFrom.call(req, hdr.username),
        hdr.gmdate,
        msgIdString.call(req, hdr.postid, hdr.messagetype),
        msgReferers.call(req, hdr.refid, hdr.messagetype),
        '',
        msgXRef.call(req, req.session.current, hdr.messageid)
      ].join('\t'));
    });
    res.end('.');
  });
};


Commander.prototype.cmdXHdr = function (req, res) {
  res.end('503 Not implemented yet');
};


Commander.prototype.preloadArticle = function (req, res) {
  var self = this;

  this.database.getArticle(req.session.currentGroupId, req.params[1], function (err, article) {
    if (err) {
      res.emit('next', err);
      return;
    }

    if (!article) {
      res.end('423 no such article number in this group');
      return;
    }

    req.article = article;
    res.emit('next');
  });
};


Commander.prototype.preloadArticleHead = function (req, res) {
  res.end('503 Not implemented yet');
};


Commander.prototype.preloadArticleBody = function (req, res) {
  res.end('503 Not implemented yet');
};


Commander.prototype.cmdArticle = function (req, res) {
  res.write(req.articleHead);
  res.write('');
  res.write(req.articleBody);
  res.end('.');
};


Commander.prototype.cmdHead = function (req, res) {
  res.write(req.articleHead);
  res.end('.');
};


Commander.prototype.cmdBody = function (req, res) {
  res.write(req.articleBody);
  res.end('.');
};


Commander.prototype.cmdNewsGroups = function (req, res) {
  res.end('503 Not implemented yet');
};


Commander.create = function (database, logger) {
  return new Commander(database, logger);
};


Commander.prototype.execute = function (req, res) {
  var self = this,
      meta = {action: req.action, params: req.params},
      stack = COMMANDS[req.action],
      command, matches, handlers;

  this.logger.verbose('COMMANDER execute', meta);

  if (undefined === stack) {
    this.logger.warn('COMMANDER command not found', meta);
    res.end('500 command not recognized');
    return;
  }

  if (0 === stack.length) {
    this.logger.warn('COMMANDER Empty command stack detected', meta);
    res.end('503 program fault - command not performed');
    return;
  }

  stack = stack.slice(); // clone the stack
  while (stack.length) {
    command = stack.shift();
    matches = command.regexp.exec(req.params);

    if (matches) {
      handlers = command.handlers.slice();
      req.params = matches;

      self.logger.debug('COMMANDER Processing handlers chain',
                        {length: handlers.length});

      res.on('next', function (err) {
        var next = handlers.shift();

        self.logger.verbose('COMMANDER ...', {
          got_next_handler: (undefined !== next),
          handlers_left: handlers.length
        });

        if (!err && !next) {
          err = new Error("No more handlers in the chain");
        }

        if (err) {
          self.logger.warn('COMMANDER Failed execute chain',
                           {err: err.message || err.toString()});
          res.end('503 program fault - command not performed');
          return;
        }

        next.call(self, req, res);
      });

      res.emit('next');
      return;
    }
  }

  this.logger.warn('COMMANDER invalid syntax', meta);
  res.end('501 command syntax error');
};



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
