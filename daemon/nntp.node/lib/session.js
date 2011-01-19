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
var crypto = require('crypto');

// Storage for session objects;
var sessionStore = {};
var sid_next = 1;

var Session = function(stream) {
    this.ip = stream.remoteAddress;
    this.current = "";      // currently selected group name
    this.first = 0;         // first msg id in current group
    this.last = 0;          // last msg id in current group
    this.userid = 0;  
    this.username = '';
    this._password = '';
    this.css = '';
    this.menu = '';
    this.template = '';
    this.groups = {};       // { name : id, ...}
    this.grp_ids = '';      // "2,5,7,8,9,15,..."
};

Session.prototype.__defineGetter__('password', function () { return this._password; });
Session.prototype.__defineSetter__('password', function (value) {
    this._password = crypto.createHash('md5').update(value).digest("hex");
});

exports.get = function(sid) { return sessionStore[sid]; };

exports.set = function(sid, values) {
    Object.keys(values).forEach(function(name, index, array) {
        sessionStore[sid][name] = values[name];
    });
};

exports.create = function(stream) {
    // create new session object, if not exists
    var key = sid_next;
    sessionStore[key] = new Session(stream);
    sid_next++;
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
