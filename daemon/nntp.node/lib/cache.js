var crypto = require('crypto');

var cache = {};

var blacklistTimeout = 300;     // 5 minutes
var blacklistTrigger = 10;      // 10 retries, prior to block
var sessionTimeout = 300;       // 5 minutes
var groupsListTimeout = 600;        // 10 minutes freeze for groups list
var groupStatTimeout = 120;         // 2 minutes freese for each group counters

// drop data from cache
var drop = function(key) {
  delete cache[key];
};

// put data to cache + set expiration timer
var set = function(key, value, time) {
    var expire = time*1000 + Date.now();
    cache[key] = { value: value, expire: expire };
    // cleanup timer
    if (!isNaN(expire)) {
        setTimeout(function() { drop(key); }, expire);
    }
};

// get data from cache
var get = function(key) {
    var data = cache[key];
    if (typeof data != "undefined") {
        if (isNaN(data.expire) || data.expire >= Date.now()) {
            return data.value;
        } else {
            // remove outdated data
            drop(key);
        }
    }
    return null;
};

/*
 *  Check if session ip is in blacklist
 */
exports.blacklistCheck = function(session) {
    var bl_count = get('bl_' + session.ip);
    if (!!bl_count && (bl_count >= blacklistTrigger)) {
        return true;
    }
    return false;
};

/*
 *  Increase blacklist counter for session IP
 */
exports.blacklistAdd = function(session) {
    var bl_count = get('bl_' + session.ip) || 0;
    set('bl_' + session.ip, bl_count+1, blacklistTimeout);
};

/*
 *  Check if session ip is in blacklist
 */
exports.sessionSave = function(session) {
    var key = 's_' +
            crypto.createHash('md5').update(session.username).digest("hex") +
            session.password;

    var s = {
        userid :        session.userid,
        css :           session.css,
        menu :          session.menu,
        template :      session.template,
        group_ids_str : session.group_ids_str
    };

    set(key, s, sessionTimeout);
};

/*
 *  Increase blacklist counter for session IP
 */
exports.sessionLoad = function(session) {
    var key = 's_' +
            crypto.createHash('md5').update(session.username).digest("hex") +
            session.password;

    var s = get(key);
    
    if (!!s) {
        Object.keys(s).forEach(function(field, index, array) {
            session[field] = s[field];
        });
        return true;
    }
    return false;
};

/*
 * Save groups list - group names & ids, without counters.
 */
exports.groupsSave = function(group_ids_list, groups) {
    set('grplst_' + group_ids_list, groups, groupsListTimeout);    
};

/*
 * Load groups list - group names, ids, without counters.
 */
exports.groupsLoad = function(group_ids_list) {
    return get('grplst_' + group_ids_list);
};

/*
 * Save group counters - min, max, total.
 */
exports.groupstatSave = function(group) {
    var gstat = {
        min :   group.first,
        max :   group.last,
        count : group.count
    }
    set('grpstat_' + group.id, gstat, groupStatTimeout);    
};

/*
 * Load groups counters - min, max, total.
 */
exports.groupstatLoad = function(group_id) {
    return get('grpstat_' + group_id);
};

