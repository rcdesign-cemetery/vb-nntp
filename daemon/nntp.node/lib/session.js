/**
 * Session store
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

var util = require('util');

// Storage for session objects;
var sessionStore = {};

exports.get = function(sid) {
    if (sessionStore[sid]) {
        return sessionStore[sid];
    }
    
    throw Error('Tryed to extract session with wrong id: ' + sid);
};

exports.create = function(stream) {
    // create new session object, if not exists
    var s = {};
    s.ip = stream.remoteAddress;
    s.currentgroup = "";       // selected group name
    s.userid = 0;  
    s.username = '';
    s.password = '';
    s.css = '';
    s.menu = '';
    s.template = '';
    // User accessible groups
    // [name] -> (id, count, first, last, permissions)
    s.groups = {};
    s.group_ids_str = '';      // "2,5,7,8,9,15,..."
    
    var key = +new Date() + '_' + stream.remoteAddress+ '_' + stream.remotePort;
    sessionStore[key] = s;
    
    return key;
};

exports.destroy = function(sid) {
    sessionStore[sid].groups = null;
    sessionStore[sid] = null;
    delete sessionStore[sid];
};

exports.dump = function() {
    var msg = 'Sessions storage: ' + Object.keys(sessionStore).length + ' total\n\n';
    
    Object.keys(sessionStore).forEach(function(name, index, array) {
        msg += '  ' + sessionStore[name].username + ',    ' +
                sessionStore[name].ip + '\n';
    });
    
    return msg;
};
