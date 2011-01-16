/**
 * NNTP low level IO
 * 
 * @link https://github.com/rcdesign/vb-nntp_gate
 * 
 * @license http://creativecommons.org/licenses/by-nc-nd/3.0/ Creative Commons BY-CC-ND
 *  
 * @author Vitaly Puzrin <vitaly@rcdesign.ru>
 * @author Evgeny Shluropat <vitaly@rcdesign.ru>
 * 
 * @copyright RC Design, Vitaly Puzrin
*/

var crypto = require('crypto');
var http = require('http');

var config = require('./config.js');
var cache = require('./cache.js'); 
var db = require('./db.js'); 

var TablePrefix = '';


/**
 * HTTP request to php backend.
 * If all ok, auth table updated after reply
 */
var kickBackend = function(callback) {
    var cfg = config.vars;
    
    var http_client = http.createClient(cfg.ForumPort, cfg.ForumHost);
    
    // handle connection problems
    http_client.on('error', function(err) {
        callback(Error('Backend connection problem'));
    });
    
    var request = http_client.request('GET', '/nntpauth.php',
                                        { 'host': cfg.ForumHost }
    );

    // handle backend reply
    request.on('response', function (response) {
        response.setEncoding('utf8');
        response.on('data', function (chunk) {
            if (chunk === 'Ok') {
                callback(null);
            } else {
                callback(Error('Bad response from backend'));
            }
        });
    });

    request.end();
};


/**
 * Get last/first groups stat from DB
 * for all user groups
 */
exports.getGroupsStat = function(session, callback) {
    var sql =   "SELECT" +
                "   `groupid`   , " +
                "   MIN( `messageid` ) AS 'first', " +
                "   MAX( `messageid` ) AS 'last' " +
                "FROM `" + TablePrefix + "nntp_index` AS `Index` " +
                "WHERE " +
                "   `groupid` IN(0," + session.group_ids_str + ") " +
                "GROUP BY `groupid` ";

    db.queryRead(sql, function(err, rows) {
        callback(err, rows);
    });
};

/**
 * Get last/first/total for selected group from DB
 * for all user groups
 */
exports.getGroupInfo = function(session, group_id, callback) {
    var sql =   "SELECT" +
                "   MIN( `messageid` ) AS 'first', " +
                "   MAX( `messageid` ) AS 'last', " +
                "   COUNT( `messageid` ) AS 'total' " +
                "FROM `" + TablePrefix + "nntp_index` AS `Index` " +
                "WHERE " +
                "   `groupid` = " + group_id + " " +
                "   AND `deleted` = 'no' ";

    db.queryRead(sql, function(err, rows) {
        callback(err, rows);
    });
};


/**
 * Load all headers info. Used in XOVER & XHDR
 * 
 * @param {int} group_id    Group id to load from
 * @param {int} rande_min   min message id
 * @param {int} group_max   max message id
 * 
 * @return {Object} 
 */
exports.getHeaders = function(group_id, range_min, range_max, callback) {
    var sql =   "SELECT " +
                "   `title`       AS `title`     , " +
                "   `groupid`     AS `groupid`   , " +
                "   `messageid`   AS `messageid` , " +
                "   `messagetype` AS `messagetype`, " +
                "   `parentid`    AS `refid`     , " +
                "   `postid`      AS `postid`    , " +
                "   `username`     AS `username`  , " +
                "   DATE_FORMAT( " +
                "       CONVERT_TZ( " +
                "           `datetime`, " +
                "           'SYSTEM', " +
                "           '+00:00' " +
                "       ), " +
                "       '%a, %d %b %Y %T +00:00' " +
                "   ) AS `gmdate` " +
                "FROM `" + TablePrefix + "nntp_index` " +
                "WHERE " +
                "    `groupid` = " + group_id +
                "    AND `deleted` = 'no' " +
                "    AND `messageid` >= " + range_min +
                "    AND `messageid` <= " + range_max;

    db.queryRead(sql, callback);
};


/**
 * Get new groups list
 */
exports.getNewGroups = function(session, time, callback) {
    var sql =   "SELECT" +
                "   `groupid`, " +
                "   MAX( `messageid` ) AS 'first', " +
                "   MIN( `messageid` ) AS 'last' " +
                "FROM `" + TablePrefix + "nntp_index` AS `Index` " +
                "WHERE " +
                "   `groupid` IN( " +
                "       SELECT `id` " +
                "       FROM `" + TablePrefix + "nntp_groups` " +
                "       WHERE " +
                "           `id` IN(" + session.group_ids_str + ") " +
                "           AND `is_active`    = 'yes' " +
                "           AND `date_create` >= '" + time + "' " +
                "               ) " +
                "GROUP BY `groupid` ";

    db.queryRead(sql, callback);
};


/**
 * Load ARTICLE / HEAD / BODY data
 */
exports.getArticle = function(group_id, article_id, callback) {
    var sql;
   
    sql =       "SELECT " +
                "   `groupid`     AS `groupid`  , " +
                "   `messageid`   AS `messageid`, " +
                "   `messagetype` AS `messagetype`, " +
                "   `body`        AS `body`     , " +
                "   `username`  AS `username` , " +
                "   `postid`   AS `postid`   , " +
                "   `parentid` AS `refid`    , " +
                "   `title`    AS `subject`  , " +
                "    DATE_FORMAT( " +
                "       CONVERT_TZ( " +
                "                `datetime`, " +
                "                'SYSTEM', " +
                "                '+00:00' " +
                "              ), " +
                "              '%a, %d %b %Y %T +00:00' " +
                "    )  AS `gmdate` " +
                "FROM `" + TablePrefix + "nntp_index` " +
                "WHERE " +
                "   `groupid` = " + group_id +

                "   AND `messageid`  = " + article_id +
                "   AND `deleted` = 'no' ";

    db.queryRead(sql, function(err, rows) {
        if (err) {
            callback(err);
        } else {
            callback(null, rows[0]);
        }
    });
};

/**
 * Try to load user session from db
 * 
 * session.username & session.password must be filled
 */
var loadUser = function(session, callback) {
    var i;
    
    // Calculate user password hash
    var authhash = crypto.createHash('md5').update(session.password).digest("hex");

    // Both user record & grop permissions must exist
    // JOIN guarantees that. If one absent, we should kick backend to build.
    var sql = "SELECT " +
            "   `U`.`usergroupslist`, " +
            "   `U`.`userid`, " +
            "   `G`.`nntpgroupslist`, " +
            "   `G`.`template`, " +
            "   `G`.`css`, " +
            "   `G`.`menu` " +
            "FROM `" + TablePrefix + "nntp_userauth_cache` AS U " +
            "JOIN `" + TablePrefix + "nntp_groupaccess_cache` AS `G` " +
            "   ON( `U`.`usergroupslist` = `G`.`usergroupslist` ) " +
            "WHERE `U`.`username` = '" + db.escapeStr(session.username) + "' " +
            "   AND `U`.`authhash` = '" + db.escapeStr(authhash) + "' " +
            "   AND `U`.`usergroupslist` != '' ";

    db.queryRead(sql, function(err, rows) {
        if (err) {
            callback(err);
            return;
        } 
            
        if (rows.length == 0) {
            callback(null);
            return;
        }
        
        // Store user data to session & cache it
        session.userid = rows[0].userid;
        session.css = rows[0].css;
        session.menu = rows[0].menu;
        session.template = rows[0].template;
        session.group_ids_str = rows[0].nntpgroupslist;
        
        // Load map 'group name' => 'grou id'
        // Probably, should be global
        // Order groups by name for LIST cmd output
        sql =   'SELECT ' +
                '   `group_name`, ' +
                '   `id` ' +
                'FROM `' + TablePrefix + 'nntp_groups` ' +
                'WHERE ' +
                '   `id` IN(0,' + session.group_ids_str + ') ' +
                'ORDER BY ' +
                '   `group_name`';

        db.queryRead(sql, function(err, rows) {
            if (err) {
                callback(err);
                return;
            }

            for(i=0; i<rows.length; i++){
                session.groups[rows[i].group_name] = rows[i].id;
            }
            callback(null);
        });
    });
};


/**
 * AUTH Check
 * 
 * Check user login (nick|email) & password from session
 * Fill session records on success (groups, acceess_level, etc)
 */
exports.checkAuth = function(session, callback) {
    var sql;
    
    // Filter brute force attempts
    if (cache.blacklistCheck(session)) {
        callback(Error('Brute force attampt. User: ' + session.username));
        return;
    }

    // Ping db & reconnect on lost connection
    // A bit dirty - syncronous call. But ping is cheap & quick
    db.ping();

    // Fallback to DB load, then try full auth
    loadUser(session, function(err) {
        if (err) {
            callback(err);
            return;
        }
        
        // User loaded? Great!
        if (session.userid) {
            callback(null);
            return;
        }

        var authhash = crypto.createHash('md5').update(session.password).digest("hex");

        sql =   "REPLACE INTO `" + TablePrefix + "nntp_userauth_cache` " +
                "   SET " +
                "       `username`       = '" + db.escapeStr(session.username) + "', " +
                "       `authhash`       = '" + db.escapeStr(authhash) + "', " +
                "       `usergroupslist` = '', " +
                "       `userid`         = 0 ";
                    
        db.queryWrite(sql, function(err) {
            if (err) {
                callback(err);
                return;
            }
            
            kickBackend(function(err) {
                if (err) {
                    callback(err);
                    return;
                }

                loadUser(session, function(err) {
                    if (err) {
                        callback(err);
                        return;
                    }
                    
                    if (!session.userid) {
                        cache.blacklistAdd(session);						
					}
					
                    callback(null);
                });
            });
        });
    });
};
