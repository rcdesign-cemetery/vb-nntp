/**
 * Logger module
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

var initialized = false;

// 7 -> 07
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


/**
 * Open log file
 */
var open = function() {
    if (!!log_file_name) {
        log_handle = fs.openSync(log_file_name, 'a');
    }
    return;
};


/**
 * Close log file
 */
var close = function() {
    if (!!log_handle) {
        try {
            fs.closeSync(log_handle);
        } catch (e) {
        }
    }
    return;
};

exports.close = close;


/**
 * Reopen log file (for log rotation)
 */
exports.reopen = function() {
    close();
    open();
    return;
};


/**
 * Init logger. Prepare settings and open log file (if need)
 */
exports.init = function() {
    // set enabled events
    var types, i;

    var cfg = config.vars;

    if (typeof(cfg.LogLevel) !== 'undefined') {
        types = config.get_list(cfg.LogLevel);
    } else {
        types = default_types;
    }
    
    if ((0 !== types.length)) {
        for (i=0; i<types.length; i++) {
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

    initialized = true;
    
    return true;
};


/**
 * Write message to file
 *
 * @param {String} log_type    Event type
 * 
 *      'info'  - server start|stop etc
 *      'cmd'   - nntp commands
 *      'reply' - server reply, only first string
 *      'multistring' - server reply, all
 *      'error' - error
 *        
 * @param {Object} msg     String / Exception / Array of strings
 */
exports.write = function(log_type, msg) {

    // If log module initilized, then skip disabled events,
    // or if log completely disable in config.
    // If not initialized - push all to console, to see startup fuckups.
    if (initialized && (!log_handle || !enabled_types[log_type])) { 
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

    if (!!log_handle) {
        try {
            fs.writeSync(log_handle, timestamp() + ' ' + message + '\n', null, 'utf8');
        } catch (e) {
        }
    } else {
        console.log(timestamp() + ' ' + message + '\n');
    }

    return;
};
