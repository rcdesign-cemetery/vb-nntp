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

// Shared part of all sessions (css, menu, template)
// Depends on ACL (permissions)
// That helps to keep session object smart & update all on the fly
var sessionShared = {
    css : {},
    menu : {},
    template : {},
    groups : {},
    grp_ids : {}
};

var sid_next = 1;

var Session = function(socket) {
    this.ip = socket.remoteAddress;
    this.current = "";      // currently selected group name
    this.first = 0;         // first msg id in current group
    this.last = 0;          // last msg id in current group
    this.userid = 0;  
    this.username = '';
    this._password = '';
    this.shared_id = '';    // id of shared part (forum groups used)
};

Session.prototype.__defineGetter__('password', function () {
    return this._password;
});
Session.prototype.__defineSetter__('password', function (value) {
    this._password = crypto.createHash('md5').update(value).digest("hex");
});

Session.prototype.__defineGetter__('css', function () {
    return sessionShared.css[this.shared_id] || ''; });
Session.prototype.__defineSetter__('css', function (value) {
    if (!this.shared_id) { return false; }
    sessionShared.css[this.shared_id] = value;
    return true;
});

Session.prototype.__defineGetter__('menu', function () {
    return sessionShared.menu[this.shared_id] || ''; });
Session.prototype.__defineSetter__('menu', function (value) {
    if (!this.shared_id) { return false; }
    sessionShared.menu[this.shared_id] = value;
    return true;
});

Session.prototype.__defineGetter__('template', function () {
    return sessionShared.template[this.shared_id] || ''; });
Session.prototype.__defineSetter__('template', function (value) {
    if (!this.shared_id) { return false; }
    sessionShared.template[this.shared_id] = value;
    return true;
});

Session.prototype.__defineGetter__('grp_ids', function () {
    return sessionShared.grp_ids[this.shared_id] || ''; });
Session.prototype.__defineSetter__('grp_ids', function (value) {
    if (!this.shared_id) { return false; }
    sessionShared.grp_ids[this.shared_id] = value;
    return true;
});

Session.prototype.__defineGetter__('groups', function () {
    return sessionShared.groups[this.shared_id] || {}; });
Session.prototype.__defineSetter__('groups', function (value) {
    if (!this.shared_id) { return false; }
    sessionShared.groups[this.shared_id] = value;
    return true;
});

var get = function(sid) { return sessionStore[sid]; };

exports.get = get;

exports.set = function(sid, values) {
    if (!get(sid)) { return false; }
    
    Object.keys(values).forEach(function(name, index, array) {
        sessionStore[sid][name] = values[name];
    });
    
    return true;
};

exports.create = function(socket) {
    // create new session object, if not exists
    var key = sid_next;
    sessionStore[key] = new Session(socket);
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
