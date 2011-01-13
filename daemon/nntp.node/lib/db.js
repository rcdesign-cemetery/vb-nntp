/**
 * Simple mysql wrapper
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

var mysql = require('mysql/mysql-libmysqlclient');

var logger = require('./logger.js');

var conn = mysql.createConnectionSync();


/**
 * Escape string for mysql. Don't use native function,
 * because it doesn't work without connect.
 */
exports.escapeStr = function(str) {
    return str.replace(/[\\"']/g, "\\$&").replace(/[\n]/g, "\\n")
                .replace(/[\r]/g, "\\r").replace(/\x00/g, "\\0");
};


/**
 * DataBase connect & reconnect. Parameters taket from
 * external config module.
 */
var connect = function() {
    // prior to reconnect we should close current resource
    if (!!conn.connectedSync && conn.connectedSync()) {
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


/**
 * Test db connection
 * 
 * @param {Object}  config Daemon config, with db params 
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
        test_conn = null;
        return true;
    }
    test_conn = null;    
    return false;
};


/**
 * Run async read query with connection check
 * and automatica free result.
 */
exports.queryRead = function(sql, callback) {
    if (!conn.connectedSync()) {
        if (!connect()) {
            callback(Error('Db connection lost'));
            return;
        }
    }
    conn.query(sql, function(err, res) {
        if (err) {
            // check if connection failed & try to reconnect
            if (!conn.pingSync()) {
                logger.write('error', Error('Db connection lost, reconnecting...'));
                connect();
            }
            callback(err);
        } else {
            res.fetchAll(false, function (err, rows) {
                if (err) {
                    callback(err);
                } else {
                    res.freeSync();
                    callback(null, rows);
                }
            });
        }
    });
};


/**
 * Run async write query with connection check
 * and automatic free result.
 */
exports.queryWrite = function(sql, callback) {
    if (!conn.connectedSync()) {
        if (!connect()) {
            callback(Error('Db connection lost'));
            return;
        }
    }
    conn.query(sql, function(err, res) {
        // check if connection failed & try to reconnect
        if (!conn.pingSync()) {
            logger.write('error', Error('Db connection lost, reconnecting...'));
            connect();
        }
        callback(err);
    });
};


/**
 * Sync query (read/write), wrapped with connection check
 */
exports.querySync = function(sql) {
    if (!conn.connectedSync()) {
        if (!connect()) {
            return null;
        }
    }

    var result = conn.querySync(sql);
    
    if (!result && !conn.pingSync()) {
        logger.write('error', Error('Db connection lost, reconnecting...'));
        connect();
    }
    return result;
};
