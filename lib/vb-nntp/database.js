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
    cache = require('./cache');


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

function int(s) {
  return (parseInt(s, 10) === +s) ? (+s) : (-1);
}

function escape(s) {
  return s.replace(/[\\"']/g, "\\$&").replace(/[\n]/g, "\\n")
          .replace(/[\r]/g, "\\r").replace(/\x00/g, "\\0");
}


// private methods: fn.call(this, *args)
////////////////////////////////////////////////////////////////////////////////

function kickBackend(callback) {
  var self = this, request, params;

  this._logger.verbose('DATABASE kickBackend()');

  params = {
    host: this.vbconfig.forum_host,
    port: this.vbconfig.forum_port,
    path: '/nntpauth.php',
    method: 'GET'
  };

  this._logger.debug("DATABASE kickBackend() request", params);
  request = http.request(params);

  request.on('response', function (response) {
    self._logger.verbose("DATABASE kickBackend() response");

    response.setEncoding('utf8');
    response.on('data', function (chunk) {
      self._logger.debug("DATABASE kickBackend() data", {chunk: chunk.toString()});

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
}


/**
 * Try to load user session from db
 * 
 * session.username & session.password must be filled
 */
function loadUser(session, callback) {
  var self = this;

  this._logger.verbose('DATABASE loadUser()');

  // Both user record & group permissions must exist
  // JOIN guarantees that. If one absent, we should kick backend to build.
  this._read(
    "SELECT `U`.`usergroupslist`, `U`.`userid`, `G`.`nntpgroupslist`, " +
    "       `G`.`template`, `G`.`css`, `G`.`menu` " +
    "  FROM " + this._table('nntp_userauth_cache') + " AS `U` " +
    "  JOIN " + this._table('nntp_groupaccess_cache') + " AS `G` " +
    "    ON `U`.`usergroupslist` = `G`.`usergroupslist` " +
    " WHERE `U`.`username` = '" + escape(session.username) + "' " +
    "   AND `U`.`authhash` = '" + escape(session.password) + "' " +
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

      self._read(
        "SELECT `group_name`, `id` " +
        "  FROM " + self._table('nntp_groups') +
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
}


// public appublic api
////////////////////////////////////////////////////////////////////////////////

var Database = module.exports = function Database(options, logger) {
  var self = this;

  if (!(this instanceof Database)) {
    return new Database(options);
  }

  logger.debug('DATABASE Initiating connection');

  // protected properties
  this._prefix = options.prefix || '';
  this._logger = logger;
  this._conn = mysql.createConnectionSync();

  // try to connect or throw an error
  this._conn.initSync();
  this._conn.setOptionSync(this._conn.MYSQL_OPT_RECONNECT, 1);
  this._conn.setOptionSync(this._conn.MYSQL_OPT_CONNECT_TIMEOUT, 7*24*60*60);
  this._conn.setOptionSync(this._conn.MYSQL_INIT_COMMAND, "SET NAMES utf8");
  this._conn.realConnectSync(
    options.host,
    options.username,
    options.password,
    options.database,
    options.port,
    options.socket
  );

  // throw an error if we failed to connect
  if (!this._conn.connectedSync() || !this._conn.pingSync()) {
    throw new Error("Cannot connect database");
  }
};


Database.create = function (options, logger) {
  return new Database(options, logger);
};


var vbconfig = null;
Database.prototype.__defineGetter__('vbconfig', function () {
  if (null === vbconfig) {
    this._logger.debug('DATABASE Get VBulletin config');
    vbconfig = this.getVbulletinConfig();
  }

  return vbconfig;
});


Database.prototype._table = function (name) {
  return '`' + this._prefix + name + '`';
};


Database.prototype._query = function (sql, callback) {
  var err;

  this._logger.debug('DATABASE query()', {sql: sql});

  // warning! race condition detected socket closed, but commander was
  // scheduled by node.js for execution.
  if (null === this._conn) {
    this._logger.debug('DATABASE seems like DB was destroyed before...');
    err = new Error("Database connection was destroyed");
    err.skipLogger = true;
    callback(err);
    return;
  }

  this._conn.query(sql, function (err, res) {
    if (err) {
      // provide some extra info about error
      err.sql = sql;
    }

    callback(err, res);
  });
};


Database.prototype._read = function (sql, callback) {
  this._query(sql, function (err, res) {
    if (err) {
      callback(err);
      return;
    }

    res.fetchAll(callback);
  });
};


Database.prototype.destroy = function () {
  this._logger.debug('DATABASE Closing connection');

  this._conn.closeSync();
  this._conn = null;
};


/**
 * Get last/first groups stat from DB for all user groups
 */
Database.prototype.getGroupsStat = function (valid_ids, callback) {
  this._logger.verbose('DATABASE getGroupStat()');
  this._read(
    'SELECT `groupid`, MIN(`messageid`) AS `first`, MAX(`messageid`) AS `last` ' +
    '  FROM ' + this._table('nntp_index') + ' AS `Index` ' +
    ' WHERE `groupid` IN (0,' + valid_ids + ') ' +
    ' GROUP BY `groupid`',
    callback
  );
};


/**
 * Get last/first/total for selected group from DB for all user groups
 */
Database.prototype.getGroupInfo = function (group_id, callback) {
  this._logger.verbose('DATABASE getGroupInfo()');
  this._read(
    "SELECT MIN( `messageid` ) AS `first`, " +
    "       MAX( `messageid` ) AS `last`, " +
    "       COUNT( `messageid` ) AS `total` " +
    "  FROM " + this._table('nntp_index') + " AS `Index` " +
    " WHERE `groupid` = " + group_id + " AND `deleted` = 'no'",
    function (err, rows) {
      callback(err, rows ? rows.shift() : null);
    }
  );
};


/**
 * Load all headers info. Used in XOVER & XHDR
 */
Database.prototype.getHeaders = function (group_id, range_min, range_max, callback) {
  this._logger.verbose('DATABASE getHeaders()');
  this._read(
    "SELECT `title`, `groupid`, `messageid`, `messagetype`, `postid`, " +
    "       `username`, `parentid` AS `refid`, " + date_format(convert_tz('`datetime`')) + " AS `gmdate` " +
    "  FROM " + this._table('nntp_index') +
    " WHERE `groupid` = " + int(group_id) + " AND `deleted` = 'no' " +
    "   AND `messageid` >= " + int(range_min) +
    "   AND `messageid` <= " + int(range_max),
    callback
  );
};


/**
 * Get new groups list
 */
Database.prototype.getNewGroups = function (valid_ids, time, callback) {
  this._logger.verbose('DATABASE getNewGroups()');
  this._read(
    "SELECT `groupid`, MIN(`messageid`) AS `first`, MAX(`messageid`) AS `last` " +
    "  FROM " + this._table('nntp_index') + " AS `Index` " +
    " WHERE `groupid` IN (" +
    "         SELECT `id` " +
    "           FROM " + this._table("nntp_groups") + " " +
    "          WHERE `id` IN(" + valid_ids + ") " +
    "            AND `is_active` = 'yes' " +
    "            AND `date_create` >= '" + escape(time) + "' " +
    "       ) " +
    " GROUP BY `groupid`",
    callback
  );
};


/**
 * Load ARTICLE / HEAD / BODY data
 */
Database.prototype.getArticle = function (group_id, article_id, callback) {
  this._logger.verbose('DATABASE getArticle()');
  this._read(
    "SELECT `groupid`, `messageid`, `messagetype`, `body`, `username`, `postid`, " +
    "       `parentid` AS `refid`, `title` AS `subject`, " +
    "       " + date_format(convert_tz('`datetime`')) + " AS `gmdate`, " +
    "       " + date_format(adddate(convert_tz('`datetime`'), this.vbconfig.msg_expires)) + " AS `expires` " +
    "  FROM " + this._table('nntp_index') +
    " WHERE `groupid` = " + int(group_id) + " AND `deleted` = 'no' " +
    "   AND messageid = " + int(article_id),
    function (err, rows) {
      callback(err, rows ? rows.shift() : null);
    }
  );
};


/**
 * AUTH Check
 * 
 * Check user login (nick|email) & password from session
 * Fill session records on success (groups, acceess_level, etc)
 */
Database.prototype.checkAuth = function (session, callback) {
  var self = this;

  this._logger.verbose('DATABASE checkAuth()');

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

    self._query(
      "REPLACE INTO " + self._table('nntp_userauth_cache') +
      "    SET `username` = '" + escape(session.username) + "', " +
      "        `authhash` = '" + escape(session.password) + "', " +
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
};


// synchronously reads VBulletin config from database, so it may throw error
Database.prototype.getVbulletinConfig = function () {
  var self = this, vbconfig = {}, config_map, config_keys, rows, parsed_url;

  this._logger.verbose('DATABASE getVbulletinConfig()');

  config_map = { 
    nntp_from_address: 'from_addr',
    bburl: 'forum_url',
    bbactive: 'active',
    nntp_message_in_list_timeout: 'msg_expires'
  };

  config_keys = Object.keys(config_map).map(function (k) {
    return "'" + k + "'";
  });

  // this might throw an error, but that's ok - this is synchronous function
  rows = this._conn.querySync(
    "SELECT * " +
    "  FROM " + this._table('setting') +
    " WHERE `varname` IN (" + config_keys.join(',') + ")"
  ).fetchAllSync();

  rows.forEach(function (row) {
    self._logger.verbose('DATABASE getVbulletinConfig() row', {
      varname: row.varname,
      value: row.value
    });
    vbconfig[config_map[row.varname]] = row.value;
  });

  if (!vbconfig.from_addr) {
    throw new Error("You should set 'From' field in NNTP vBulletin settings. " + 
                    "For example: noreply@your.forum");
  }

  if (vbconfig.forum_url) {
    parsed_url = url.parse(vbconfig.forum_url);
    vbconfig.forum_host = parsed_url.hostname;
    vbconfig.forum_port = +parsed_url.port || 80;
  }

  return vbconfig;
};


////////////////////////////////////////////////////////////////////////////////
// vim:ts=2:sw=2
////////////////////////////////////////////////////////////////////////////////
