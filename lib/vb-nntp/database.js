/**
 *  VBNNTP - Database
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


var mysql = require('db-mysql'),
    http = require('http'),
    url = require('url'),
    format = require('util').format,
    cache = require('./cache'),
    dummy = require('./logger').dummy;

// internal helpers
////////////////////////////////////////////////////////////////////////////////

function date_format(s) {
  return format("DATE_FORMAT(%s, '%a, %d %b %Y %T +0000')", s);
}

function convert_tz(s) {
  return format("CONVERT_TZ(%s, 'SYSTEM', '+00:00')", s);
}

function adddate(s, d) {
  return format("ADDDATE(%s, INTERVAL %d DAY)", s, d);
}

// private methods: fn.call(this, *args)
////////////////////////////////////////////////////////////////////////////////

function getVbulletinConfig(callback, force) {
  var self = this, config_map;

  // simple caching. query is called in sync mode.
  if (!!this._vbulletinConfig && !force) {
    callback(null, this._vbulletinConfig);
    return;
  }

  config_map = { 
    nntp_from_address: 'from_addr',
    bburl: 'forum_url',
    bbactive: 'active',
    nntp_message_in_list_timeout: 'msg_expires'
  };

  this._connect(function (err, db) {
    if (err) {
      callback(err);
      return;
    }

    db.query()
      .select('*')
      .from(db.table('setting'), false)
      .where('varname IN ?', [Object.keys(config_map)])
      .execute(function (err, rows) {
        var row, config = {}, parsed_url;

        if (err) {
          callback(err);
          return;
        }

        rows.forEach(function (row) {
          config[config_map[row.varname]] = row.value;
        });

        if (!config.from_addr) {
          callback(new Error("You should set 'From' field in NNTP vBulletin settings. " + 
                            "For example: noreply@your.forum"));
        }

        if (config.forum_url) {
          parsed_url = url.parse(config.forum_url);
          config.forum_host = parsed_url.hostname;
          config.forum_port = parsed_url.port || 80;
        }

        self._vbulletinConfig = config;
        callback(null, config);
      }, {async: false, cast: false});
  });
}


function kickBackend(callback) {
  var self = this;

  this._logger.verbose('DATABASE kickBackend()');

  this._connect(function (err, db) {
    if (err) {
      callback(err);
      return;
    }

    self._logger.verbose('DATABASE kickBackend() Get VB config');

    getVbulletinConfig.call(self, function (err, config) {
      var request;

      if (err) {
        callback(err);
        return;
      }

      request = http.request({
        host: config.forum_host,
        port: config.forum_port,
        path: '/nntpauth.php',
        method: 'GET'
      });

      self._logger.debug("DATABASE kickBackend() request", request);

      request.on('response', function (response) {
        self._logger.debug("DATABASE kickBackend() response");

        response.on('data', function (chunk) {
          self._logger.debug("DATABASE kickBackend() data", {chunk: chunk});

          if ('Ok' === chunk) {
            callback(null);
            return;
          }

          callback(new Error("Bad response from backend"));
        });
      });
      
      request.on('error', function (err) {
        self._logger.debug('DATABASE kickBackend() error');
        callback(err);
      });
    });
  });
}


/**
 * Try to load user session from db
 * 
 * session.username & session.password must be filled
 */
function loadUser(session, callback) {
  var self = this;

  this._connect(function (err, db) {
    var query;

    if (err) {
      callback(err, false);
      return;
    }

    query = db.query();

    // Both user record & grop permissions must exist
    // JOIN guarantees that. If one absent, we should kick backend to build.
    query.select("`U`.`usergroupslist`, `U`.`userid`, `G`.`nntpgroupslist`, " +
                "`G`.`template`, `G`.`css`, `G`.`menu`");

    query.from({U: db.table('nntp_userauth_cache', false)});
    query.join({
      alias: 'G',
      table: db.table('nntp_groupaccess_cache', false),
      conditions: '`U`.`usergroupslist` = `G`.`usergroupslist`'
    });

    query.where("`U`.`username` = ? AND `U`.`authhash` = ? AND `U`.`usergroupslist` != ?",
                [session.username, session.password, '']);

    query.execute(function (err, rows) {
      var s;

      if (err || 0 === rows.length) {
        callback(err, false);
        return;
      }

      s = {
        // should be first
        shared_id : rows[0].usergroupslist.replace(/,/, '_'),
        userid : rows[0].userid,
        css : rows[0].css,
        menu : rows[0].menu,
        template : rows[0].template,
        grp_ids : rows[0].nntpgroupslist,
        groups : {}
      };

      db.query(
        "SELECT `group_name`, `id` " +
        "  FROM " + db.table('nntp_groups') +
        " WHERE `id` IN (0," + s.grp_ids + ") " +
        " GROUP BY `group_name`"
      ).execute(function (err, rows) {
        if (err) {
          callback(err, false);
          return;
        }

        rows.forEach(function (row) {
          s.groups[row.group_name] = row.id;
        });

        Object.getOwnPropertyNames(s).forEach(function (k) {
          session[k] = s[k];
        });

        callback(null, true);
      });
    }, {cast: false});
  });
}

// public appublic api
////////////////////////////////////////////////////////////////////////////////

var Database = module.exports = function Database(options, logger) {
  var prefix, db, db_options;

  if (!(this instanceof Database)) {
    return new Database(options);
  }

  db_options =  {
    user:       options.username,
    password:   options.password,
    database:   options.database
  };

  if (options.socket) {
    db_options.socket = options.socket;
  } else {
    db_options.hostname = options.host || 'localhost';
    db_options.port = +options.port || 3306;
  }

  db = new mysql.Database(db_options);

  prefix = options.prefix || '';
  db.table = function (name, escape) {
    var table = prefix + name;
    return (false === escape) ? table : this.name(table);
  }

  this._vbulletinConfig = null;
  this._logger = logger || dummy;

  this._connect = function (callback) {
    if (db.isConnected()) {
      callback(null, db);
      return;
    }

    db.connect({async: false}, function (err, server) {
      if (err || db.isConnected()) {
        callback(err, db);
        return;
      }

      // THIS SHOULD NEVER HAPPEN, BUT IT DOES SOMETIMES :((
      callback(new Error("Database not connected"), null);
    });
  };
};


Database.create = function (options) {
  return new Database(options);
};


/**
 * Get last/first groups stat from DB for all user groups
 */
Database.prototype.getGroupsStat = function (valid_ids, callback) {
  this._connect(function (err, db) {
    if (err) {
      callback(err);
      return;
    }

    db.query(
      'SELECT `groupid`, MIN(`messageid`) AS `first`, MAX(`messageid`) AS `last` ' +
      '  FROM ' + db.table('nntp_index') + ' AS `Index` ' +
      ' WHERE `groupid` IN (0,' + valid_ids + ') ' +
      ' GROUP BY `groupid`'
    ).execute(callback);
  });
};


/**
 * Get last/first/total for selected group from DB for all user groups
 */
Database.prototype.getGroupInfo = function (group_id, callback) {
  this._connect(function (err, db) {
    if (err) {
      callback(err);
      return;
    }

    db.query(
      "SELECT MIN( `messageid` ) AS `first`, " +
      "       MAX( `messageid` ) AS `last`, " +
      "       COUNT( `messageid` ) AS `total` " +
      "  FROM " + db.table('nntp_index') + " AS `Index` " +
      " WHERE `groupid` = " + group_id + " AND `deleted` = 'no'"
    ).execute(function (err, rows) {
      callback(err, rows ? rows.shift() : null);
    });
  });
};


/**
 * Load all headers info. Used in XOVER & XHDR
 */
Database.prototype.getHeaders = function (group_id, range_min, range_max, callback) {
  this._connect(function (err, db) {
    var query;

    if (err) {
      callback(err);
      return;
    }

    query = db.query().from(db.table('nntp_index', false));

    query.select([
      'title', 'groupid', 'messageid', 'messagetype', 'postid', 'username',
      {'refid': 'parentid'},
      {'gmdate': date_format(convert_tz('`datetime`'))}
    ]);

    query.where("`groupid` = ? AND deleted = ? AND messageid >= ? AND messageid <= ?",
                [group_id, 'no', range_min, range_max]);

    query.execute(callback);
  });
};


/**
 * Get new groups list
 */
Database.prototype.getNewGroups = function (valid_ids, time, callback) {
  this._connect(function (err, db) {
    if (err) {
      callback(err);
      return;
    }

    db.query(
      "SELECT `groupid`, MIN(`messageid`) AS `first`, MAX(`messageid`) AS `last` " +
      "  FROM " + db.table('nntp_index') + " AS `Index` " +
      " WHERE `groupid` IN (" +
      "         SELECT `id` " +
      "           FROM " + db.table("nntp_index") + " " +
      "          WHERE `id` IN(" + valid_ids + ") " +
      "            AND `is_active` = 'yes' " +
      "            AND `date_create` >= '" + time + "' " +
      "       ) " +
      " GROUP BY `groupid`"
    ).execute(callback);
  });
};


/**
 * Load ARTICLE / HEAD / BODY data
 */
Database.prototype.getArticle = function (group_id, article_id, callback) {
  var self = this;

  getVbulletinConfig.call(self, function (err, config) {
    if (err) {
      callback(err);
      return;
    }

    self._connect(function (err, db) {
      var query;

      if (err) {
        callback(err);
        return;
      }

      query = db.query().from(db.table('nntp_index', false));

      query.select([
        'groupid', 'messageid', 'messagetype', 'body', 'username', 'postid',
        {'refid': 'parentid'},
        {'subject': 'title'},
        {'gmdate': date_format(convert_tz('`datetime`'))},
        {'expires': date_format(adddate(convert_tz('`datetime`'), config.msg_expires))}
      ]);

      query.where("`groupid` = ? AND deleted = ? AND messageid = ?",
                  [group_id, 'no', article_id]);

      query.execute(function (err, rows) {
        callback(err, rows ? rows.shift() : null);
      });
    });
  });
};


/**
 * AUTH Check
 * 
 * Check user login (nick|email) & password from session
 * Fill session records on success (groups, acceess_level, etc)
 */
Database.prototype.checkAuth = function (session, callback) {
  var self = this;

  // Filter brute force attempts
  if (cache.blacklistCheck(session.ip)) {
    // (no error, no auth, bruteforce)
    callback(null, false, true);
    return;
  }

  loadUser.call(self, session, function (err, loaded) {
    // (err, false) || (null, true)
    if (err || loaded) {
      callback(err, loaded);
      return;
    }

    self._connect(function (err, db) {
      if (err) {
        callback(err);
        return;
      }

      db.query(
        "REPLACE INTO " + db.table('nntp_userauth_cache') +
        "    SET `username` = ?, `authhash` = ?, " +
        "         `usergroupslist` = '', `userid` = 0",
        [session.username, session.password]
      ).execute(function (err) {
        if (err) {
          callback(err, false);
          return;
        }

        kickBackend.call(self, function (err) {
          if (err) {
            callback(err, false);
            return;
          }

          loadUser.call(self, session, function(err, loaded) {
            // KLUDGE: this might go into first call closure, so here we will
            //         simply have loadUser.call(self, session, callback);
            // no error, but user not found - increment blacklist
            if (!err && !loaded) {
              cache.blacklistAdd(session.ip);						
            }
            
            // return result
            callback(err, loaded);
          });
        });
      });
    });
  });
};


////////////////////////////////////////////////////////////////////////////////
// vim:ts=2:sw=2
////////////////////////////////////////////////////////////////////////////////
