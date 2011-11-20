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


var mysql = require('mysql-libmysqlclient'),
    http = require('http'),
    url = require('url'),
    cache = require('./cache'),
    dummy = require('./logger').dummy;

// internal helpers
////////////////////////////////////////////////////////////////////////////////

function date_format(s) {
  return "DATE_FORMAT(" + s + ", '%a, %d %b %Y %T +0000')";
}

function convert_tz(s) {
  return "CONVERT_TZ(" + s + ", 'SYSTEM', '+00:00')";
}

function adddate(s, d) {
  return "ADDDATE(" + s + ", INTERVAL " + (+d) + " DAY)";
}


// private methods: fn.call(this, *args)
////////////////////////////////////////////////////////////////////////////////

function kickBackend(callback) {
  var self = this;

  this.logger.verbose('DATABASE kickBackend()');

  this._connect(function (err, db) {
    if (err) {
      callback(err);
      return;
    }

    self.getVbulletinConfig(function (err, config) {
      var request, params;

      if (err) {
        callback(err);
        return;
      }

      params = {
        host: config.forum_host,
        port: config.forum_port,
        path: '/nntpauth.php',
        method: 'GET'
      };

      self.logger.debug("DATABASE kickBackend() request", params);
      request = http.request(params);

      request.on('response', function (response) {
        self.logger.verbose("DATABASE kickBackend() response");

        response.setEncoding('utf8');
        response.on('data', function (chunk) {
          self.logger.debug("DATABASE kickBackend() data", {chunk: chunk.toString()});

          if ('Ok' === chunk) {
            callback(null);
            return;
          }

          callback(new Error("Bad response from backend"));
        });
      });
      
      request.on('error', function (err) {
        callback(err);
      });

      // send request
      request.end();
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

  this.logger.verbose('DATABASE loadUser()');

  this._connect(function (err, db) {
    if (err) {
      callback(err, false);
      return;
    }

    // Both user record & group permissions must exist
    // JOIN guarantees that. If one absent, we should kick backend to build.
    db.query(
      "SELECT `U`.`usergroupslist`, `U`.`userid`, `G`.`nntpgroupslist`, " +
      "       `G`.`template`, `G`.`css`, `G`.`menu` " +
      "  FROM " + db.table('nntp_userauth_cache') + " AS `U` " +
      "  JOIN " + db.table('nntp_groupaccess_cache') + " AS `G` " +
      "    ON `U`.`usergroupslist` = `G`.`usergroupslist` " +
      " WHERE `U`.`username` = '" + db.escape(session.username) + "' " +
      "   AND `U`.`authhash` = '" + db.escape(session.password) + "' " +
      "   AND `U`.`usergroupslist` != ''",
      function (err, rows) {
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
          " GROUP BY `group_name`",
          function (err, rows) {
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
          }
        );
      }
    );
  });
}

// public appublic api
////////////////////////////////////////////////////////////////////////////////

var Database = module.exports = function Database(options, logger) {
  var self = this, db, conn, prefix;

  if (!(this instanceof Database)) {
    return new Database(options);
  }

  conn    = mysql.createConnectionSync();
  prefix  = options.prefix || '';

  this._vbulletinConfig = null;
  this.logger = logger || dummy;

  // provide some simplified public api
  db = {
    escape: conn.escapeSync,
    int: function (s) {
      return (parseInt(s, 10) === +s) ? (+s) : (-1);
    },
    table: function (name) {
      return '`' + prefix + name + '`';
    },
    query: function (sql, callback) {
      conn.query(sql, function (err, res) {
        if (err) {
          callback(err);
          return;
        }

        res.fetchAll(callback);
      });
    },
    queryWrite: function (sql, callback) {
      conn.query(sql, function (err) {
        callback(err);
      });
    }
  };

  this._connect = function (callback) {
    if (conn.connectedSync()) {
      callback(null, db);
      return;
    }

    try {
      conn.initSync();
      conn.setOptionSync(conn.MYSQL_OPT_RECONNECT, 1);
      conn.setOptionSync(conn.MYSQL_OPT_CONNECT_TIMEOUT, 7*24*60*60);
      conn.setOptionSync(conn.MYSQL_INIT_COMMAND, "SET NAMES utf8");
      conn.realConnectSync(
        options.host,
        options.username,
        options.password,
        options.database,
        options.port,
        options.socket
      );

      if (conn.connectedSync() && conn.pingSync()) {
        callback(null, db);
      }
    } catch (err) {
      callback(err);
      return;
    }

    callback(new Error("Database not connected"));
  };
};


Database.create = function (options, logger) {
  return new Database(options, logger);
};


/**
 * Get last/first groups stat from DB for all user groups
 */
Database.prototype.getGroupsStat = function (valid_ids, callback) {
  this.logger.verbose('DATABASE getGroupStat()');

  this._connect(function (err, db) {
    if (err) {
      callback(err);
      return;
    }

    db.query(
      'SELECT `groupid`, MIN(`messageid`) AS `first`, MAX(`messageid`) AS `last` ' +
      '  FROM ' + db.table('nntp_index') + ' AS `Index` ' +
      ' WHERE `groupid` IN (0,' + valid_ids + ') ' +
      ' GROUP BY `groupid`',
      callback
    );
  });
};


/**
 * Get last/first/total for selected group from DB for all user groups
 */
Database.prototype.getGroupInfo = function (group_id, callback) {
  this.logger.verbose('DATABASE getGroupInfo()');

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
      " WHERE `groupid` = " + group_id + " AND `deleted` = 'no'",
      function (err, rows) {
        callback(err, rows ? rows.shift() : null);
      }
    );
  });
};


/**
 * Load all headers info. Used in XOVER & XHDR
 */
Database.prototype.getHeaders = function (group_id, range_min, range_max, callback) {
  this.logger.verbose('DATABASE getHeaders()');

  this._connect(function (err, db) {
    if (err) {
      callback(err);
      return;
    }

    db.query(
      "SELECT `title`, `groupid`, `messageid`, `messagetype`, `postid`, " +
      "       `username`, `parentid` AS `refid`, " + date_format(convert_tz('`datetime`')) + " AS `gmdate` " +
      "  FROM " + db.table('nntp_index') +
      " WHERE `groupid` = " + db.int(group_id) + " AND `deleted` = 'no' " +
      "   AND `messageid` >= " + db.int(range_min) +
      "   AND `messageid` <= " + db.int(range_max),
      callback
    );
  });
};


/**
 * Get new groups list
 */
Database.prototype.getNewGroups = function (valid_ids, time, callback) {
  this.logger.verbose('DATABASE getNewGroups()');

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
      "            AND `date_create` >= '" + db.escape(time) + "' " +
      "       ) " +
      " GROUP BY `groupid`",
      callback
    );
  });
};


/**
 * Load ARTICLE / HEAD / BODY data
 */
Database.prototype.getArticle = function (group_id, article_id, callback) {
  var self = this;

  this.logger.verbose('DATABASE getArticle()');

  this.getVbulletinConfig(function (err, config) {
    if (err) {
      callback(err);
      return;
    }

    self._connect(function (err, db) {
      if (err) {
        callback(err);
        return;
      }

      db.query(
        "SELECT `groupid`, `messageid`, `messagetype`, `body`, `username`, `postid`, " +
        "       `parentid` AS `refid`, `title` AS `subject`, " +
        "       " + date_format(convert_tz('`datetime`')) + " AS `gmdate`, " +
        "       " + date_format(adddate(convert_tz('`datetime`'), config.msg_expires)) + " AS `expires` " +
        "  FROM " + db.table('nntp_index') +
        " WHERE `groupid` = " + db.int(group_id) + " AND `deleted` = 'no' " +
        "   AND messageid = " + db.int(article_id),
        function (err, rows) {
          callback(err, rows ? rows.shift() : null);
        }
      );
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

  this.logger.verbose('DATABASE checkAuth()');

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

      db.queryWrite(
        "REPLACE INTO " + db.table('nntp_userauth_cache') +
        "    SET `username` = '" + db.escape(session.username) + "', " +
        "        `authhash` = '" + db.escape(session.password) + "', " +
        "        `usergroupslist` = '', `userid` = 0",
        function (err) {
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
        }
      );
    });
  });
};


Database.prototype.getVbulletinConfig = function (callback, force) {
  var self = this, config_map;

  this.logger.verbose('DATABASE getVbulletinConfig()');

  // simple caching. query is called in sync mode.
  if (!!this._vbulletinConfig && !force) {
    self.logger.debug('DATABASE Cached vBulletin settings');
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
    var keys;

    if (err) {
      callback(err);
      return;
    }

    keys = Object.keys(config_map).map(function (k) { return "'" + k + "'"; });

    db.query(
      "SELECT * " +
      "  FROM " + db.table('setting') +
      " WHERE `varname` IN (" + keys.join(',') + ")",
      function (err, rows) {
        var parsed_url;

        if (err) {
          callback(err);
          return;
        }

        self._vbulletinConfig = {};
        self.logger.debug('DATABASE New vBulletin settings');

        rows.forEach(function (row) {
          self.logger.verbose('DATABASE getVbulletinConfig() row', {
            varname: row.varname,
            value: row.value
          });
          self._vbulletinConfig[config_map[row.varname]] = row.value;
        });

        if (!self._vbulletinConfig.from_addr) {
          callback(new Error("You should set 'From' field in NNTP vBulletin settings. " + 
                            "For example: noreply@your.forum"));
        }

        if (self._vbulletinConfig.forum_url) {
          parsed_url = url.parse(self._vbulletinConfig.forum_url);
          self._vbulletinConfig.forum_host = parsed_url.hostname;
          self._vbulletinConfig.forum_port = parsed_url.port || 80;
        }

        callback(null, self._vbulletinConfig);
      }
    );
  });
};


////////////////////////////////////////////////////////////////////////////////
// vim:ts=2:sw=2
////////////////////////////////////////////////////////////////////////////////
