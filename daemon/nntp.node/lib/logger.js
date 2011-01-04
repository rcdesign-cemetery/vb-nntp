/** -----------------------------------------------------------------
 *    Easy logger module:
 */

var fs = require('fs');

var sprintf = require('./sprintf.js').init;
var cfg = require('./config.js');

var default_types = ['info', 'error'];

var enabled_types = {
    cmd : false,
    info : false,
    error : false,
    reply : false,
    multistring : false
};

var log_handle;
var log_file_name = '';

/*
 * Open log file
 */
var open = function() {
    if (!!log_file_name) {
        log_handle = fs.openSync(log_file_name, 'a');
    }
    return;
};

/*
 *  Close log file
 */
exports.close = function() {
    if (!!log_handle) {
        try {
            fs.closeSync(log_handle);
        } catch (e) {
            // ToDo save to system log
        }
    }
    return;
};

/*
 *  Reopen log file (for log rotation)
 */
exports.reopen = function() {
    this.close();
    open();
    return;
};

/*
 *  Init logger.
 *  Prepare settings and open log file(if need)
 *
 *  Input
 *      config - array of settings, see Log section in config.ini.example 
 */
exports.init = function(config) {
    config = config || {};
    
    // set enabled events
    var types;
    if (typeof(config.LogLevel) !== 'undefined') {
        types = cfg.get_list(config.LogLevel);
    } else {
        types = default_types;
    }
    
    if ((0 !== types.length)) {
        for (var i = 0; i < types.length; i++) {
            if (typeof(types[i]) === 'undefined') {
                throw Error(types[i] + ' type of logging is not supported');
            }
            enabled_types[ types[i] ] = true;
        }
    }
    // set "reply" flag if "multistring" alredy setted
    if (enabled_types.multistring) {
        enabled_types.reply = true;
    }

    // Log file
    if (typeof(config.LogFile) !== 'undefined') {

        if (0 !== config.LogFile.length ) {
            log_file_name = config.LogFile.toString();
            open();
        }
    }

    return true;
};


/*
 *  Write message to file
 *
 *  Input
 *       log_type:
 *           'info'  - server start|stop 
 *           'cmd'   - nntp commands
 *           'reply' - server replies
 *           'error' - shit happened
 *        
 *       msg - string / exception / array of string
 *
 *       session[optional]
 */
exports.write = function(log_type, msg, session) {

    if (!log_handle) { 
        return;
    }
    if (!enabled_types[log_type]) {
        return;
    }

    var now = new Date();

    var message = sprintf('%02d.%02d.%d %s ',
        now.getDate(),
        now.getMonth()+1,
        now.getFullYear(),
        now.toLocaleTimeString());

    // Check if log type reply and we have string or array of strings
    if (('reply' === log_type) &&  Array.isArray(msg)) {
        if (enabled_types.multistring) {
            message += msg.join('\n');
        } else {
            message += msg[0];
        }
    } else if (msg instanceof Error) {
        message += 'Exception handled:\n';
        Object.keys(msg).forEach(function(element, index, array) {
            message += element + ' => ' + msg[element] + '\n';
        });
    } else {
        message += msg.toString();
    }

    try {
        fs.writeSync(log_handle, message + '\n', null, 'utf8');
    } catch (e) {
        // ToDo save to system log
    }

    return;
};
