/*
 * Mysql wrapper
 */

var mysql = require('mysql/mysql-libmysqlclient');

var conn = mysql.createConnectionSync();

/*
 * Escape string for mysql
 */
exports.escapeStr = function(str) {
    return str.replace(/[\\"']/g, "\\$&").replace(/[\n]/g, "\\n")
                .replace(/[\r]/g, "\\r").replace(/\x00/g, "\\0");
};


/*
 * DataBase connect & reconnect
 * 
 *  store config in global var on success
 */
exports.connect = function() {
    // prior to reconnect we should close current resource
    if (!!conn && conn.connectedSync()) {
        conn.closeSync();
    }
    
    var cfg = require('./config.js').vars;
    
    conn.connectSync(cfg.Host, 
                    cfg.Username, 
                    cfg.Password, 
                    cfg.DataSource,
                    cfg.Port);
    if (conn.connectedSync() && conn.pingSync()) {
        conn.querySync("SET NAMES UTF8" );
        return true;
    }
    
    return false;
};

/*
 * Test db connection
 */
exports.test = function(config) {
    var test_conn = mysql.createConnectionSync();

    test_conn.connectSync(config.Host, 
                    config.Username, 
                    config.Password, 
                    config.DataSource,
                    config.Port);
    if (test_conn.connectedSync() && test_conn.pingSync()) {
        test_conn.closeSync();
        return true;
    }
    
    return false;
};


/*
 * Run Async read query with connection check
 * and automatically free result.
 */
exports.queryRead = function(sql, callback) {

    if (!conn.connectedSync()) {
        if (!this.connect()) {
            callback(Error('Db connection lost'));
            return;
        }
    }
    conn.query(sql, function(err, res) {
        if (err) {
            // check if connection failed & try to reconnect
            if (!conn.pingSync()) {
                this.connect();
            }
            callback(err);
        } else {

// TODO Why async fetch sucks ????
/*
            res.fetchAll(function (err, rows) {
                if (err) {
                    callback(err);
                } else {
                    res.freeSync();
                    callback(null, rows);
                }
            });
*/
            var rows = res.fetchAllSync();
            if(!rows) {
                callback(Error('can\'t fetch, shit happened'));
            } else {
                callback(null, rows);
            }

        }
    });
};


/*
 * Run Async write query with connection check
 * and automatically free result.
 */
exports.queryWrite = function(sql, callback) {
    if (!conn.connectedSync()) {
        if (!this.connect()) {
            callback(Error('Db connection lost'));
            return;
        }
    }
    conn.query(sql, function(err, res) {
        // check if connection failed & try to reconnect
        if (!conn.pingSync()) {
            this.connect();
        }
        callback(err);
    });
};


/*
 * Sync query wrapped with connection check
 */
exports.querySync = function(sql) {
    if (!conn.connectedSync()) {
        if (!this.connect()) {
            return null;
        }
    }
    var result = conn.querySync(sql);
    
    if (!result && !conn.pingSync()) {
        this.connect();
    }
    return result;
};
