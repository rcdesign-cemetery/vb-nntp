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
var crypto = require('crypto'),
    common = require('./common'),
    nntp = require('./nntp');


// hash of commands (action => {regexp, handlers}, ...)
var COMMANDS = {};


// predefined status responses
var STATUS = {
  _100_HELP_FOLLOWS      : '100 Help text follows',
  _111_DATE              : '111 ',
  _201_SRV_READY_RO      : '201 Server ready - No posting allowed',
  _211_GRP_SELECTED      : '211 ',
  _215_INFO_FOLLOWS      : '215 Information follows',
  _220_ARTICLE_FOLLOWS   : '220 Article retrieved - head and body follow',
  _221_HEAD_FOLLOWS      : '221 Article retrieved - head follows',
  _222_BODY_FOLLOWS      : '222 Article retrieved - body follows',
  _224_OVERVIEW_INFO     : '224 Overview information follows',
  _231_GRP_FOLLOWS       : '231 List of new newsgroups follows',
  _281_AUTH_ACCEPTED     : '281 Authentication accepted',
  _381_AUTH_NEED_PASS    : '381 More authentication information required',
  _403_FUCKUP            : '403 Internal fault',
  _411_GRP_NOT_FOUND     : '411 No such newsgroup',
  _412_GRP_NOT_SLCTD     : '412 No newsgroup has been selected',
  _420_ARTICLE_NOT_SLCTD : '420 No current article has been selected',
  _423_NO_ARTICLE_IN_GRP : '423 No such article number in this group',
  _480_AUTH_REQUIRED     : '480 Authentication required',
  _481_AUTH_REJECTED     : '481 Authentication rejected',
  _481_AUTH_BLACKLIST    : '481 Authentication rejected (too many attempts)',
  _482_AUTH_OUT_OF_SEQ   : '482 Authentication commands issued out of sequence',
  _500_CMD_UNKNOWN       : '500 Command not recognized',
  _501_SYNTAX_ERROR      : '501 Command syntax error',
  _502_CMD_UNAVAILABLE   : '502 Command unavailable'
};


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
  COMMANDS[action] = {
    regexp: regexp,
    handlers: Array.prototype.slice.call(arguments, 2)
  };
}


// creates and starts stack of handlers (middleware) execution
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
      self.logger.error('COMMANDER Failed execute chain',
                        extractRequestMeta(req, err));
      res.end(STATUS._403_FUCKUP);
      return;
    }

    curr.call(self, req, res, next);
  };

  next();
}


// prepares `meta` objet for winston logger
function extractRequestMeta(req, err) {
  var meta = {};

  meta.request = '"' + req.rawData + '"';
  meta.action = req.action;

  if (req.session) {
    meta.ip = req.session.ip;

    ['userid', 'username', 'current'].forEach(function (k) {
      if (req.session[k]) {
        meta[k] = req.session[k];
      }
    });
  }

  if (err) {
    meta.error = common.dumpError(err);
  }

  return meta;
}


// PRIVATE HELPERS -- fn(this, *args)
////////////////////////////////////////////////////////////////////////////////


/**
 * Build message id string as "<messageid>@<gateid>"
 * Example: "5902@example.com"
 */
function msgIdString(self, msgId, msgType) {
  return '<' + msgId + '.' + msgType + '@' + self.database.vbconfig.forum_host + '>';
}


/**
 * Build reference id string as "<referenceid>.ref@<gateid>"
 * Example: "120.ref@example.com"
 */
function msgReferers(self, refererId, msgType) {
  return '<' +refererId + '.' + msgType + '.ref@' + self.database.vbconfig.forum_host + '>';
}


/**
 * Build message field Xref
 * Example: your.nntp.com cool.sex.binary:3748
 */      
function msgXRef(self, group, msgId) {
  return 'Xref: ' + self.database.vbconfig.forum_host + " " + group + ':' + msgId;
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
      meta = extractRequestMeta(req),
      command = COMMANDS[req.action];

  this.logger.verbose('COMMANDER execute', meta);

  if (undefined === command) {
    this.logger.warn('COMMANDER command not found', meta);
    res.end(STATUS._500_CMD_UNKNOWN);
    return;
  }

  req.params = command.regexp.exec(req.params);

  if (!req.params) {
    this.logger.warn('COMMANDER invalid syntax', meta);
    res.end(STATUS._501_SYNTAX_ERROR);
    return;
  }

  self.logger.debug('COMMANDER Processing handlers chain',
                    {length: command.handlers.length});

  executeHandlersChain.call(self, command.handlers, req, res);
};


// COMMAND HANDLERS
////////////////////////////////////////////////////////////////////////////////


Commander.prototype.cmdHelp = function (req, res) {
  res.end([STATUS._100_HELP_FOLLOWS, '.']);
};


Commander.prototype.cmdDate = function (req, res) {
  var now = new Date();
  res.end(
    STATUS._111_DATE +
    now.getUTCFullYear() +
    padLeft(2, '0', now.getUTCMonth() + 1) +
    padLeft(2, '0', now.getUTCDate()) +
    padLeft(2, '0', now.getUTCHours()) +
    padLeft(2, '0', now.getUTCMinutes()) +
    padLeft(2, '0', now.getUTCSeconds())
  );
};


Commander.prototype.cmdMode = function (req, res) {
  res.end(STATUS._201_SRV_READY_RO);
};


Commander.prototype.cmdAuthInfo = function (req, res, next) {
  var self = this, meta;

  if (req.session.userid) {
    res.end(STATUS._502_CMD_UNAVAILABLE);
    return;
  }

  if ('USER' === req.params[1].toUpperCase()) {
    req.session.username = req.params[2];
    res.end(STATUS._381_AUTH_NEED_PASS);
    return;
  }

  // else arg = PASS
  if (!req.session.username) {
    res.end(STATUS._482_AUTH_OUT_OF_SEQ);
    return;
  }

  // params validator allows req.params[1] to be either USER or PASS only
  meta = {username: req.session.username};
  req.session.password = crypto.createHash('md5').update(req.params[2]).digest("hex");

  self.logger.debug('AUTHINFO Authenticating user', meta);
  self.database.checkAuth(req.session, function (err, verified, bruteforce) {
    if (err) {
      next(err);
      return;
    }

    if (verified) {
      self.logger.notice('AUTHINFO Authentication success', meta);
      res.end(STATUS._281_AUTH_ACCEPTED);
      return;
    }

    if (bruteforce) {
      self.logger.warn('AUTHINFO Brute force deteted', meta);
      res.end(STATUS._481_AUTH_BLACKLIST);
      return;
    }

    self.logger.notice('AUTHINFO Authentication failed', meta);
    res.end(STATUS._481_AUTH_REJECTED);
  });
};


Commander.prototype.requiresAuthentication = function (req, res, next) {
  if (req.session.userid) {
    next();
    return;
  }

  res.end(STATUS._480_AUTH_REQUIRED);
};


Commander.prototype.cmdList = function (req, res, next) {
  this.database.getGroupsStat(req.session.grp_ids, function (err, rows) {
    var groups = req.session.groups;

    if (err) {
      next(err);
      return;
    }

    if (!groups) {
      next(new Error("cmdList() expects session to have groups"));
      return;
    }

    res.write(STATUS._215_INFO_FOLLOWS);
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


Commander.prototype.cmdNewGroups = function (req, res, next) {
  var d = req.params[1], t = req.params[2],
      dt = [d.slice(0, -4), d.slice(-4, -2), d.slice(-2)].join('-') + ' ' +
           [t.slice(0, -4), t.slice(-4, -2), d.slice(-2)].join(':');

  this.database.getNewGroups(req.session.grp_ids, dt, function (err, rows) {
    if (err) {
      next(err);
      return;
    }

    res.write(STATUS._231_GRP_FOLLOWS);
    Object.getOwnPropertyNames(req.session.groups).forEach(function (name) {
      var id = req.session.groups[name];
      if (!!rows[id]) {
        res.write([name, rows[id].last, rows[id].first, 'n'].join(' '));
      }
    });
    res.end('.');
  });
};


Commander.prototype.cmdGroup = function (req, res, next) {
  var group_id = req.session.groups[req.params[1]];

  if (!group_id) {
    res.end(STATUS._411_GRP_NOT_FOUND);
    return;
  }

  this.database.getGroupInfo(group_id, function (err, info) {
    var first, last, total;

    if (err) {
      next(err);
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

    res.end(STATUS._211_GRP_SELECTED + [total, first, last, req.params[1]].join(' '));
  });
};


Commander.prototype.cmdListGroup = function (req, res, next) {
  var self = this,
      group = req.params[1],
      group_id = req.session.groups[group];

  if (!group_id) {
    res.end(STATUS._411_GRP_NOT_FOUND);
    return;
  }

  this.database.getGroupInfo(group_id, function (err, info) {
    var first, last, total;

    if (err) {
      next(err);
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
        next(err);
        return;
      }

      res.write(STATUS._211_GRP_SELECTED + [total, first, last, group, 'list follows'].join(' '));
      hdrs.forEach(function (hdr) {
        res.write(hdr.messageid);
      });
      res.end('.');
    });
  });
};


Commander.prototype.cmdXOver = function (req, res, next) {
  var self = this, group_id, range_min, range_max;

  if (!req.session.current) {
    res.end(STATUS._412_GRP_NOT_SLCTD);
    return;
  }

  if (!req.params[1]) {
    res.end(STATUS._420_ARTICLE_NOT_SLCTD);
    return;
  }

  group_id = req.session.groups[req.session.current];
  range_min = +req.params[2];
  range_max = !!req.params[3] ? (+req.params[4] || req.session.last) : range_min;

  this.database.getHeaders(group_id, range_min, range_max, function (err, hdrs) {
    if (err) {
      next(err);
      return;
    }

    if (!hdrs.length) {
      res.end(STATUS._423_NO_ARTICLE_IN_GRP);
      return;
    }

    res.write(STATUS._224_OVERVIEW_INFO);
    hdrs.forEach(function (hdr) {
      res.write([
        hdr.messageid,
        msgSubject(hdr.title),
        msgFrom(hdr.username),
        hdr.gmdate,
        msgIdString(self, hdr.postid, hdr.messagetype),
        msgReferers(self, hdr.refid, hdr.messagetype),
        '',
        msgXRef(self, req.session.current, hdr.messageid)
      ].join('\t'));
    });
    res.end('.');
  });
};


var XHDR_FORMAT = {
  'FROM':       function (req, hdr) { return [hdr.messageid, msgFrom(hdr.username)]; },
  'SUBJECT':    function (req, hdr) { return [hdr.messageid, msgSubject(hdr.title)]; },
  'MESSAGE-ID': function (req, hdr) { return [hdr.messageid, msgIdString(this, hdr.postid, hdr.messagetype)]; },
  'REFERENCES': function (req, hdr) { return [hdr.messageid, msgReferers(this, hdr.refid, hdr.messagetype)]; },
  'DATE':       function (req, hdr) { return [hdr.messageid, hdr.gmdate]; },
  '__UNDEF__':  function (req, hdr) { return [hdr.messageid]; }

};

Commander.prototype.cmdXHdr = function (req, res, next) {
  var group_id, range_min, range_max, formatter;

  if (!req.session.current) {
    res.end(STATUS._412_GRP_NOT_SLCTD);
    return;
  }

  if (!req.params[2]) {
    res.end(STATUS._420_ARTICLE_NOT_SLCTD);
    return;
  }

  group_id = req.session.groups[req.session.current];
  range_min = +req.params[2];
  range_max = !!req.params[3] ? (+req.params[4] || req.session.last) : range_min;
  formatter = (XHDR_FORMAT[req.params[1].toUpperCase()] || XHDR_FORMAT.__UNDEF__).bind(this);

  this.database.getHeaders(group_id, range_min, range_max, function (err, hdrs) {
    if (err) {
      next(err);
      return;
    }

    if (!hdrs.length) {
      res.end(STATUS._423_NO_ARTICLE_IN_GRP);
      return;
    }

    res.write(STATUS._221_HEAD_FOLLOWS);
    hdrs.forEach(function (hdr) {
      res.write(formatter(req, hdr).join(' '));
    });
    res.end('.');
  });
};


Commander.prototype.preloadArticle = function (req, res, next) {
  var self = this, group_id = req.session.groups[req.session.current];

  this.database.getArticle(group_id, req.params[1], function (err, article) {
    if (err) {
      next(err);
      return;
    }

    if (!article) {
      res.end(STATUS._423_NO_ARTICLE_IN_GRP);
      return;
    }

    req.article = article;
    next();
  });
};


Commander.prototype.preloadArticleHead = function (req, res, next) {
  req.articleHead = [];

  req.articleHead.push("From: "       + msgFrom(req.article.username));
  req.articleHead.push("Newsgroups: " + req.session.current);
  req.articleHead.push("Subject: "    + msgSubject(req.article.subject));
  req.articleHead.push("Date: "       + req.article.gmdate);
  req.articleHead.push("Message-ID: " + msgIdString(this, req.article.postid, req.article.messagetype));
  req.articleHead.push("References: " + msgReferers(this, req.article.refid, req.article.messagetype));
  req.articleHead.push("Expires: "    + req.article.expires);

  req.articleHead.push("Content-Type: text/html; charset=utf-8");
  req.articleHead.push("Content-Transfer-Encoding: base64");
  req.articleHead.push("Charset: utf-8");

  req.articleHead.push(msgXRef(this, req.session.current, req.article.messageid));

  next();
};


Commander.prototype.preloadArticleBody = function (req, res, next) {
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

  next();
};


Commander.prototype.cmdArticle = function (req, res) {
  res.write(STATUS._220_ARTICLE_FOLLOWS);
  res.write(req.articleHead);
  res.write('');
  res.write(req.articleBody);
  res.end('.');
};


Commander.prototype.cmdHead = function (req, res) {
  res.write(STATUS._221_HEAD_FOLLOWS);
  res.write(req.articleHead);
  res.end('.');
};


Commander.prototype.cmdBody = function (req, res) {
  res.write(STATUS._222_BODY_FOLLOWS);
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
                          Commander.prototype.cmdList);
addCommand('NEWGROUPS',   /^(\d{6,8})\s+(\d{6})(?:\s+GMT)?$/,
                          Commander.prototype.requiresAuthentication,
                          Commander.prototype.cmdNewGroups);
addCommand('GROUP',       /^(.+)$/,
                          Commander.prototype.requiresAuthentication,
                          Commander.prototype.cmdGroup);
addCommand('LISTGROUP',   /^([^\s]+)$/,
                          Commander.prototype.requiresAuthentication,
                          Commander.prototype.cmdListGroup);
addCommand('XOVER',       /^((\d+)(-(\d+)?)?)?$/,
                          Commander.prototype.requiresAuthentication,
                          Commander.prototype.cmdXOver);
addCommand('XHDR',        /^(FROM|SUBJECT|MESSAGE-ID|REFERENCES|DATE)(?:\s+(\d+)(-(\d+)?)?)?$/i,
                          Commander.prototype.requiresAuthentication,
                          Commander.prototype.cmdXHdr);
addCommand('ARTICLE',     /^(\d+)$/,
                          Commander.prototype.requiresAuthentication,
                          Commander.prototype.preloadArticle,
                          Commander.prototype.preloadArticleHead,
                          Commander.prototype.preloadArticleBody,
                          Commander.prototype.cmdArticle);
addCommand('HEAD',        /^(\d+)$/,
                          Commander.prototype.requiresAuthentication,
                          Commander.prototype.preloadArticle,
                          Commander.prototype.preloadArticleHead,
                          Commander.prototype.cmdHead);
addCommand('BODY',        /^(\d+)$/,
                          Commander.prototype.requiresAuthentication,
                          Commander.prototype.preloadArticle,
                          Commander.prototype.preloadArticleBody,
                          Commander.prototype.cmdBody);


////////////////////////////////////////////////////////////////////////////////
// vim:ts=2:sw=2
////////////////////////////////////////////////////////////////////////////////
