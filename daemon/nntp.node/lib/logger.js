/** -----------------------------------------------------------------
 *    Easy logger module:
 */

var fs = require('fs');

var config = require('./config.js');

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


function pad(n) {
    return n < 10 ? '0' + n.toString(10) : n.toString(10);
}


var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep',
                'Oct', 'Nov', 'Dec'];

// 26 Feb 16:19:34
function timestamp() {
    var d = new Date();
    var time = [pad(d.getHours()),
                pad(d.getMinutes()),
                pad(d.getSeconds())].join(':');
    return [d.getDate(), months[d.getMonth()], time].join(' ');
}

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
exports.init = function() {
    // set enabled events
    var types;

    var cfg = config.vars;

    if (typeof(cfg.LogLevel) !== 'undefined') {
        types = config.get_list(cfg.LogLevel);
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
    if (typeof(cfg.LogFile) !== 'undefined') {
        if (0 !== cfg.LogFile.length ) {
            log_file_name = cfg.LogFile.toString();
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

    var message = '';

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
        fs.writeSync(log_handle, timestamp() + ' ' + message + '\n', null, 'utf8');
    } catch (e) {
        // ToDo save to system log
    }

    return;
};
