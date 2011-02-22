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
var crypto = require('crypto');

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

function Session(socket) {
    if (!(this instanceof Session)) { return new Session(socket); } // ?(arguments[0])

    this.ip = socket.remoteAddress;
    this.current = "";      // currently selected group name
    this.first = 0;         // first msg id in current group
    this.last = 0;          // last msg id in current group
    this.userid = 0;  
    this.username = '';
    this._password = '';
    this.shared_id = '';    // id of shared part (forum groups used)
}

Session.prototype.__defineGetter__('password', function () {
    return this._password;
});
Session.prototype.__defineSetter__('password', function (value) {
    this._password = crypto.createHash('md5').update(value).digest("hex");
});

// Bulk setup proxy getters/setters for shared properties
(function(){
    var assignGetterAndSetter = function(name){
        if (!sessionShared[name]) { sessionShared[name] = {}; }

        Session.prototype.__defineGetter__(name, function(){
            return sessionShared[name][this.shared_id];
        });

        Session.prototype.__defineSetter__(name, function(value){
            if (!this.shared_id) { return false; }
            sessionShared[name][this.shared_id] = value;
            return true;
        });
    };

    var name;

    for (name in sessionShared) {
        if (sessionShared[name]) {
            assignGetterAndSetter(name);
        }
    }
}());

Session.prototype.set = function(values) {
    var self = this;
    Object.keys(values).forEach(function(name, index, array) {
        self[name] = values[name];
    });
}

exports.Session = Session;
