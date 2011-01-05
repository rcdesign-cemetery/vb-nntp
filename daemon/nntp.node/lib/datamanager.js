/* ----------------------------------------------------------------------------
    NNTP low level data io 
*/

var crypto = require('crypto');
var http = require('http');
var cfg = require('./config.js').vars;


var cache = require('./cache.js'); 
var db = require('./db.js'); 

var TablePrefix = '';

/* ----------------------------------------------------------------------------
    HTTP Request groups (call backend via HTTP request)
*/
var kickBackend = function(callback) {

// !!! TODO Fix TCP timeouts. How ???

    var http_client = http.createClient(cfg.authPort, cfg.authHost);
    var request = http_client.request('GET', '/nntpauth.php',
                                        { 'host': cfg.authHost }
    );

    request.on('response', function (response) {
        response.setEncoding('utf8');
        response.on('data', function (chunk) {
            callback(null, chunk);
        });
    });

    request.end();
};

// helper - load all available user groups (without counters) as hash
// hash is used to keep groups order
var getGroups = function(session, callback) {
    // Try to load from cache first
    var groups = cache.groupsLoad(session.group_ids_str);
    if (groups) {
        callback(null, groups);
        return;
    }
    
    // Load from db
    var sql =   "SELECT " +
                "   G.`group_name`, " +
                "   G.`id` " +
                "FROM `" + TablePrefix + "nntp_groups` AS G " +
                "WHERE " +
                "   G.`id` IN(" + session.group_ids_str + ") " +
                "ORDER BY " +
                "   G.`group_name`";

    db.queryRead(sql, function(err, rows) {
        if (err) {
            callback(err);
            return;
        }
            
        groups = {};
        for (var i=0; i<rows.length; i++) {
            groups[rows[i].group_name] = rows[i].id;
        }
        // remember result in cache
        cache.groupsSave(session.group_ids_str, groups);

        callback(null, groups);
    });
};

// helper - load groups stat from DB
var getGroupsStat = function(session, ids, callback) {
    var sqlWhere = '';

    // if nothing to load - return empty result
    if (!ids.length) {
        callback(null, []);
        return;
    }

    if (session.accesstype == 'demo') {
        var timelimit = parseInt(Date.now() / 1000, 10) - cfg.DemoDelay*60*60;
        sqlWhere =  " AND `Index`.`datetime` <= FROM_UNIXTIME(" + timelimit + ") ";
    }
    var sql =   "SELECT" +
                "   `Index`.`groupid`   , " +
                "   MAX( `Index`.`messageid` ) AS 'max'  , " +
                "   MIN( `Index`.`messageid` ) AS 'min'  , " +
                "   COUNT( `Index`.`messageid` ) AS 'count' " +
                "FROM `" + TablePrefix + "nntp_index` AS `Index` " +
                "WHERE " +
                "   `Index`.`groupid` IN(" + ids.join(',') + ") " +
                "   AND `Index`.`deleted` = 'no' " + sqlWhere +
                "GROUP BY `Index`.`groupid` ";

    db.queryRead(sql, function(err, rows) {
        callback(err, rows);
    });
};


/*
 * Fill "groups" object in user session
 */
exports.fillGroupsList = function(session, callback) {
    var cached_grp_details = [];
    var uncached_ids = [];

    // Check if groups property already filled (not empty)
    if (Object.keys(session.groups).length > 0) {
        callback(null);
        return;
    }
    
    getGroups(session, function(err, groups) {
        if(err) {
            callback(err);
            return;
        }
        
        // load counters from cache, where possible
        Object.keys(groups).forEach(function(name, index, array) {
            var cached = cache.groupstatLoad(groups[name], session.accesstype);
            if(!!cached) {
                cached_grp_details[groups[name]] = cached;
            } else {
                uncached_ids.push(groups[name]);
            }
        });

        getGroupsStat(session, uncached_ids, function(err, rows) {
            if(err) {
                callback(err);
                return;
            }

            // create group objects
            Object.keys(groups).forEach(function(name, index, array) {
                session.groups[name] = {
                    id :        groups[name],
                    first :     0,
                    last :      0,
                    count :     0,
                    post :      'n'
                };
            });

            // extract groups stats by ids
            var grp_details = [];
            for (var i=0; i<rows.length; i++) {
                grp_details[rows[i].groupid] = rows[i];
            }
            
            // join cached data
            grp_details = grp_details.concat(cached_grp_details);

            // merge groups with stastistics
            Object.keys(session.groups).forEach(function(name, index, array) {
                var grp_id = session.groups[name].id;
                if (grp_details[grp_id]) {
                    session.groups[name].first = grp_details[grp_id].min;
                    session.groups[name].last =  grp_details[grp_id].max;
                    session.groups[name].count = grp_details[grp_id].count;
                }
                
                // Group is ready. If not from cache - store for future use.
                if(!cached_grp_details[grp_id]) {
                    cache.groupstatSave(session.groups[name], session.accesstype);
                }
            });
            
            callback(null);
        });
    }); 
};


/*
 * nntp XOVER
 */
exports.getXover = function(group_id, range_min, range_max, callback) {
    var sql =   "SELECT " +
                "   `Index`.`title`       AS `title`     , " +
                "   `Index`.`groupid`     AS `groupid`   , " +
                "   `Index`.`messageid`   AS `messageid` , " +
                "   `Index`.`parentid`    AS `refid`     , " +
                "   `Index`.`postid`      AS `postid`    , " +
                "   `Group`.`group_name`  AS `groupname` , " +
                "   `User`.`username`     AS `username`  , " +
                "   DATE_FORMAT( " +
                "       CONVERT_TZ( " +
                "           `Index`.`datetime`, " +
                "           'SYSTEM', " +
                "           '+00:00' " +
                "       ), " +
                "       '%a, %d %b %Y %T +00:00' " +
                "   ) AS `gmdate` " +
                "FROM `" + TablePrefix + "nntp_index` AS `Index` " +
                "LEFT JOIN `" + TablePrefix + "nntp_groups` AS `Group` " +
                "    ON( `Index`.`groupid` = `Group`.`id`    ) " +
                "LEFT JOIN `user` AS `User` " +
                "    ON( `Index`.`userid`  = `User`.`userid` ) " +
                "WHERE " +
                "    `Index`.`groupid` = " + group_id +
                "    AND `Index`.`deleted` = 'no' " +
                "    AND `Index`.`messageid` >= " + range_min +
                "    AND `Index`.`messageid` <= " + range_max;

    db.queryRead(sql, callback);
};


/*
 * Get new groups list
 */
exports.getNewGroups = function(session, time, callback) {
    var sql =   "SELECT " +
                "   G.`group_name` AS `group` " +
                "FROM `" + TablePrefix + "nntp_groups` AS G " +
                "WHERE " +
                "       G.`id` IN(" + session.group_ids_str + ") " +
                "   AND G.`is_active`    = 'yes' " +
                "   AND G.`date_create` >= '" + time + "' " +
                "ORDER BY G.`group_name` ";

    db.queryRead(sql, function(err, rows) {
        if (err) {
            callback(err);
        } else {
            var newgroups = {};
            for(var i=0; i<rows.length; i++){
                // make shure that user have access
                if (session.groups.name[rows[i].group]) {
                    newgroups[rows[i].group] = session.groups.name[rows[i].group];
                }
            }
            callback(null, newgroups);
        }
    });
};


/*
 * Load ARTICLE / HEAD / BODY data
 */
exports.getArticle = function(group_id, article_id, callback) {
    var sql;
   
    sql =       "SELECT " +
                "   `CM`.`groupid`     AS `groupid`  , " +
                "   `CM`.`messageid`   AS `messageid`, " +
                "   `CM`.`body`        AS `body`     , " +
                "   `User`.`username`  AS `username` , " +
                "   `Index`.`postid`   AS `postid`   , " +
                "   `Index`.`parentid` AS `refid`    , " +
                "   `Index`.`title`    AS `subject`  , " +
                "    DATE_FORMAT( " +
                "       CONVERT_TZ( " +
                "                `Index`.`datetime`, " +
                "                'SYSTEM', " +
                "                '+00:00' " +
                "              ), " +
                "              '%a, %d %b %Y %T +00:00' " +
                "    )  AS `gmdate` " +
                "FROM `" + TablePrefix + "nntp_cache_messages` AS `CM` " +
                "LEFT JOIN `" + TablePrefix + "nntp_index` AS `Index` " +
                "   ON( `CM`.`groupid` = `Index`.`groupid` AND `CM`.`messageid` = `Index`.`messageid` ) " +
                "LEFT JOIN `user` AS `User` " +
                "   ON( `Index`.`userid` = `User`.`userid` ) " +
                "WHERE " +
                "   `CM`.`groupid` = " + group_id +

                "   AND `CM`.`messageid`  = " + article_id +
                "   AND `Index`.`deleted` = 'no' ";

    db.queryRead(sql, function(err, rows) {
        if (err) {
            callback(err);
        } else {
            callback(null, rows[0]);
        }
    });
};


/*
 * AUTH Check
 * 
 * Check user login (nick|email) & password from session
 * Fill session records on success (groups, acceess_level, etc)
 */
exports.checkAuth = function(session, callback) {
    var sql;
    
    // User password hash
    var authhash = crypto.createHash('md5').update(session.password).digest("hex");

    var loadUser = function(session, callback) {
        var sql = "SELECT " +
                "   `U`.`access_granted`, " +
                "   `U`.`usergroupslist`, " +
                "   `U`.`userid`, " +
                "   `G`.`nntpgroupslist`, " +
                "   `G`.`access_level`, " +
                "   `G`.`template`, " +
                "   `G`.`css`, " +
                "   `G`.`menu`, " +
                "   `G`.`demotext` " +
                "FROM `" + TablePrefix + "nntp_userauth_cache` AS U " +
                "LEFT JOIN `" + TablePrefix + "nntp_groupaccess_cache` AS `G` " +
                "   ON( `U`.`usergroupslist` = `G`.`usergroupslist` ) " +
                "WHERE `U`.`username` = '" + db.escapeStr(session.username) + "' " +
                "   AND `U`.`authhash` = '" + db.escapeStr(authhash) + "' " +
                "   AND `U`.`access_granted` = 'yes' ";

        db.queryRead(sql, function(err, rows) {
            if (err) {
                callback(err);
                return;
            } 
            
            if (rows.length > 0) {
                // kick out banned loosers
                if (rows[0].access_level === 'none') {
                    callback(null);
                    return;
                }
                
                // Store user data to session & cache it
                session.userid = rows[0].userid;
                session.accesstype = rows[0].access_level;
                session.css = rows[0].css;
                session.menu = rows[0].menu;
                session.demotext = rows[0].demotext;
                session.template = rows[0].template;
                session.group_ids_str = rows[0].nntpgroupslist;

                cache.sessionSave(session);
            }
            callback(null);
        });
    };

    // Filter brute force attempts
    if (cache.blacklistCheck(session)) {
        callback(Error('Brute force attampt. User: ' + session.username));
        return;
    }

    // Try to load from cache first
    if (cache.sessionLoad(session)) {
        callback(null);
        return;
    }

    // Fallback to DB load, then try full auth
    loadUser(session, function(err) {
        if (err) {
            callback(err);
            return;
        }
        
        if (session.userid) {    // user already exists
            callback(null);
            return;
        }
        
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
            
            kickBackend(function(err, status) {
// ?? TODO Add check if forum is offline & user have permission to access
                loadUser(session, function(err) {
                    if (err) {
                        cache.blacklistAdd(session);
                        callback(err);
                        return;
                    }
                    callback(null);
                });
            });
        });
    });
};

exports.init = function() {
    db.connect();
};
