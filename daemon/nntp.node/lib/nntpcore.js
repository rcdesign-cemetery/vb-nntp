/**
 * NNTP commands parcer
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

var dm = require('./datamanager.js');
var config = require('./config.js');

var nntpCode = {
    _100_help_follows       : '100 help text follows',
    _111_date               : '111 ',
    _200_srv_ready_rw       : '200 server ready - posting allowed',
    _201_srv_ready_ro       : '201 server ready - no posting allowed',
    _205_goodbye            : '205 closing connection - goodbye!',
    _211_group_selected     : '211 ',
    _215_info_follows       : '215 information follows',
    _220_article_follows    : '220 ',
    _221_head_follows       : '221 ',
    _221_xhdr_head_follows  : '221 Headers follow',
    _222_body_follows       : '222 ',
    _224_overview_info_follows : '224 Overview information follows',
    _231_newgroups_follows  : '231 list of new newsgroups follows',
    _281_auth_accepted      : '281 Authentication accepted',
    _381_auth_required      : '381 More authentication information required',
    _403_fuckup             : '403 internal fault',
    _411_newsgroup_notfound : '411 no such news group',
    _412_newsgroup_notselected  : '412 no newsgroup has been selected',
    _420_article_notselected    : '420 no current article has been selected',
    _423_no_article_in_group    : '423 no such article number in this group',
    _480_auth_required      : '480 Authentication required',
    _481_auth_rejected      : '481 Authentication rejected',
    _482_auth_out_of_sequence   : '482 Authentication commands issued out of sequence',
    _500_cmd_unknown        : '500 command not recognized',
    _501_syntax_error       : '501 command syntax error',
    _502_cmd_unavailable    : '502 Command unavailable',
    _503_program_fault      : '503 program fault - command not performed'
};


/**
 * Make report - exception with session details
 * 
 * @param {String|Error} err    Text string or Exception
 * @param {Object} session      User session
 * 
 * @return {Object} Error with session details
 */
var makeReport = function(err, session) {
    if (!err) {
        return null;
    }
    
    var result = (err instanceof Error) ? err : Error(err);
    
    if (!!session) {
        result.username = session.username;
        result.user_id = session.userid;
        result.ip = session.ip;
        if (!!session.currentgroup) {
            result.currentgroup = session.currentgroup;
        }
    }

    return result;
};


/**
 * Replace HTML special char
 */
var unescapeHTML = function(str) {
    if (str.length === 0) {
        return '';
    }
            
    return str.replace(/&amp;/g,'&').replace(/&gt;/g,'>')
            .replace(/&lt;/g,'<').replace(/&quot;/g,'"');
};

/**
 * Build reference id string as "<referenceid>.ref@<gateid>"
 * Example: "120.ref@example.com"
 */
var msgReferers = function(refererId, msgType) {
    return '<' +refererId + '.' + msgType + '.ref@' + config.vars.ForumHost + '>';
};


/**
 * Build message id string as "<messageid>@<gateid>"
 * Example: "5902@example.com"
 */
var msgIdString = function(msgId, msgType) {
    return '<' + msgId + '.' + msgType + '@' + config.vars.ForumHost + '>';
};


/**
 * Build message field "From" (UTF-8, Base64 encoding)
 */          
var msgFrom = function(username) {
    return '=?UTF-8?B?' + (new Buffer(unescapeHTML(username), 'utf8')).toString('base64') + '?=' +
            ' <no_reply@rcdesign.ru>';
};


/**
 * Build message "Subject" (UTF-8, Base64 encoding)
 */      
var msgSubject = function(subject) {
    return '=?UTF-8?B?' + (new Buffer(unescapeHTML(subject), 'utf8')).toString('base64') + '?=';
};


/**
 * Build message field Xref
 * Example: your.nntp.com cool.sex.binary:3748
 */      
var msgXref = function(group, msgId) {
    return 'Xref: ' + config.vars.ForumHost + " " + group + ':' + msgId;
};


/**
 * Build body for ARTICLE & BODY commands
 */
var msgBody = function(article, session) {

    var menu = session.menu.split('<% POST ID %>').join(article.postid)
                            .split('<% THREAD ID %>').join(article.refid);
    
    var parsed = session.template.replace('<% CSS %>', session.css)
            .replace('<% USER MENU %>', menu)         
            .replace('<% MESSAGE BODY %>', article.body);
        
/*    parsed = (new Buffer(parsed, 'utf8')).toString('base64');

	var body = [];

    // Cut long base64 string for short peaces
    var currentPos = 0;
    while (parsed.length > currentPos) {
        body.push(parsed.slice(currentPos, currentPos + 76));
        currentPos += 76;
    }
    return body;
*/
    // Without base64
    // Rip out \r if exists, then split by \n
    return parsed.replace(/\r/g,'').split('\n');
};


/**
 * Build headers for ARTICLE & HEAD commands
 */
var msgHeaders = function(article, session) {
    var headers = [];

    headers.push("From: " +         msgFrom(article.username));
    headers.push("Newsgroups: " +   session.currentgroup);
    headers.push("Subject: " +      msgSubject(article.subject));
    headers.push("Date: " +         article.gmdate);  // ??? .replace("+00:00", "+03:00")
    headers.push("Message-ID: " +   msgIdString(article.postid, article.messagetype));
    headers.push("References: " +  msgReferers(article.refid, article.messagetype));
    headers.push("Content-Type: text/html; charset=utf-8");
//    headers.push("Content-Transfer-Encoding: base64");
    headers.push("Content-Transfer-Encoding: 8bit");
    headers.push("Charset: utf-8");
    headers.push(msgXref(session.currentgroup, article.messageid));       
    
    return headers;
};


/**
 * nntp HELP command
 * 
 * reply: 100 help text
 */      
var cmdHelp = function(cmd, session, callback) {
    var reply = [];

    reply.push(nntpCode._100_help_follows);
    reply.push(".");

    callback(null, reply);
    reply = null;
};


/**
 * nntp QUIT command
 * 
 *  reply: 205 closing connection - goodbye! 
 */         
var cmdQuit = function(cmd, session, callback) {
    callback(null, nntpCode._205_goodbye, true); 
};

// 2 -> 02
function pad(n) {
    return n < 10 ? '0' + n.toString(10) : n.toString(10);
}

/**
 * DATE
 * 
 * reply: server date and time (UTC).
 * 
 *      111 yyyymmddhhmmss
 */
var cmdDate = function(cmd, session, callback) {
    var now = new Date();    

    callback(null, nntpCode._111_date +
        now.getUTCFullYear() +
        pad(now.getUTCMonth()+1) +
        pad(now.getUTCDay()) +
        pad(now.getUTCHours()) +
        pad(now.getUTCMinutes()) +
        pad(now.getUTCSeconds())
    ); 
};


/**
 * nntp AUTHINFO command
 * 
 * additional params:
 * 
 *      USER userlogin
 *      PASS userpassword
 * 
 * replies:
 * 
 *      381 More authentication information required
 *      281 Authenticaion accepted
 *      382 Authenticaion rejected
 */      
var cmdAuthinfo = function(cmd, session, callback) {
    var parced;
    
    // Disable command after success. See RFC 4643
    // http://tools.ietf.org/html/rfc4643
    if (session.userid) {
        callback(null, nntpCode._502_cmd_unavailable);
        return;
    }
    
    parced = cmd.params.match(/^user\s+(.+)/i);  // username
    if (parced) {
        session.username = parced[1];
        callback(null, nntpCode._381_auth_required);
        return;
    }
    
    parced = cmd.params.match(/^pass\s+(.+)/i);  // password
    if (parced) {
        if (session.username === '') {
            callback(null, nntpCode._482_auth_out_of_sequence);
            return;
        }

        session.password = parced[1];
        dm.checkAuth(session, function(err) {
            if (err) {
                callback(makeReport(err, session), nntpCode._403_fuckup);
                return;
            }
                
            if (session.userid) {
                callback(null, nntpCode._281_auth_accepted);
                return;
            } else {
                callback(null, nntpCode._481_auth_rejected);
                return;
            }
        });
    } else {
        // don't report error, no need to see messages in log,
        // that AUTHINFO GENERIC etc not implemented
        callback(null, nntpCode._501_syntax_error);
    }
};


/**
 * nntp MODE command
 * 
 * additional param (the only possible, must present):
 * 
 *      READER
 * 
 * replies:
 * 
 *      200 - Posting allowed
 *      201 - Posting prohibited
 */          
var cmdMode = function(cmd, session, callback) {
    if (cmd.params.match(/^reader$/i)) {
        callback(null, nntpCode._201_srv_ready_ro);
    } else {
        callback(makeReport('Syntax error: ' + cmd.all, session),
            nntpCode._501_syntax_error);
    } 
};


/**
 * nntp LIST command
 * 
 * No input parameters. CAN'T have any, in this implementation.
 * 
 * replies:
 * 
 *      215 list of newsgroups follows
 *      group1.name <last> <first> <permission>
 *      group2.name <last> <first> p
 *      ......
 *      groupN.name <last> <first> p
 *      .
 * 
 * 
 * <permission> is always 'n' in our case (no posting allowed)
 */
var cmdList = function(cmd, session, callback) {
    var reply = [];

    if (cmd.params) {
        callback(makeReport('Syntax error: ' + cmd.all, session),
            nntpCode._501_syntax_error); // fuckup LIST extentions
        return;
    }

    dm.fillGroupsList(session, function(err) {
        if (err) {
            callback(makeReport(err, session), nntpCode._403_fuckup);
            return;
        }

        reply.push(nntpCode._215_info_follows);

        Object.keys(session.groups).forEach(function(name, index, array) {
            reply.push( name + ' ' + session.groups[name].last + ' ' +
                session.groups[name].first + ' ' + session.groups[name].post );
        });

        reply.push(".");
        callback(null, reply);
        reply = null;
    });
};


/**
 * nntp NEWGROUPS command. Old bullshit, but Opera likes it.
 * 
 * additional params:
 * 
 *      <date> <time> [GMT]
 *
 *      <date> - 6/8 digits, (yymmdd|yyyymmdd)
 *      <time> - 6 digits, hhmmss
 *      GMT    - optional, we ignore it
 * 
 * List of newsgroups created since <date and time>. The same
 * format as for LIST command.
 * 
 * reply:
 * 
 *      231 list of new newsgroups follows
 *      .... (multiline)
 */
var cmdNewGroups = function(cmd, session, callback) {
    var reply = [];
    
    var params = cmd.params.match(/^(\d{6}|\d{8})\s+(\d{6})(\s+gmt)?$/i);

    if (params) {
        // ignore GMT param - nothing useful 
        var date = params[1].match(/^(\d+)(\d{2})(\d{2})$/);
        var time = params[2].match(/^(\d{2})(\d{2})(\d{2})$/);
        
        var datetime = '' + date[1] + '-' + date[2] + '-' + date[3] + ' ' +
                            time[1] + ':' + time[2] + ':' + time[3];
        
        dm.fillGroupsList(session, function(err) {
            if (makeReport(err, session)) {
                callback(err, nntpCode._403_fuckup);
                return;
            }
            
            dm.getNewGroups(session, datetime, function(err, newgroups) {
                if (err) {
                    callback(makeReport(err, session), nntpCode._403_fuckup);
                    return;
                }
                
                reply.push(nntpCode._231_newgroups_follows);

                Object.keys(newgroups).forEach(function(name, index, array) {
                    reply.push( name + ' ' + newgroups[name].last + ' ' +
                        newgroups[name].first + ' ' + newgroups[name].post );
                });

                reply.push(".");
                callback(null, reply);
                reply = null;
            });
        });    
    } else {
        callback(makeReport('Syntax error: ' + cmd.all, session),
            nntpCode._501_syntax_error); 
    }
};


/**
 * nntp GROUP command
 * 
 * additional params:
 * 
 *      <groupname>
 * 
 * reply (single string):
 * 
 *      211 count first-id last-id groupname
 *      411 No such newsgroup
 */            
var cmdGroup = function(cmd, session, callback) {
    
    dm.fillGroupsList(session, function(err) {
        if (err) {
            callback(makeReport(err, session), nntpCode._403_fuckup);
            return;
        }

        if (!session.groups[cmd.params]) {
            callback(null, nntpCode._411_newsgroup_notfound);
            return;
        }
            
        session.currentgroup = cmd.params;
        callback(null, nntpCode._211_group_selected +
                    session.groups[cmd.params].count + ' ' +
                    session.groups[cmd.params].first + ' ' +
                    session.groups[cmd.params].last + ' ' +
                    session.currentgroup
        );
    });
};


/**
 * nntp XOVER command
 * 
 * additional params:
 * 
 *      <range>
 * 
 *      XX-YY   - from XX to YY
 *      XX-     - from XX to end
 *      XX      - only XX
 * 
 *      (!) text message id can be used, but not implemented
 * 
 * replies:
 * 
 *      see rfc :)
 */          
var cmdXover = function(cmd, session, callback) {
    var reply = [];
    var range_min, range_max, i;

    if (session.currentgroup === '') {
        callback(null, nntpCode._412_newsgroup_notselected);
        return;
    }
    
    var range = cmd.params.match(/^(\d+)(-)?(\d+)?$/);
        
    if(!range) {
        callback(makeReport('Range error: ' + cmd.all, session),
            nntpCode._420_article_notselected);
        return;
    }
        
    var group_id = session.groups[session.currentgroup].id;
    
    
    //  xx-yy, xx-, xx
    range_min = range[1];
    if (range[2]) {
        range_max = range[3] || session.groups[session.currentgroup].last;
    } else {
        range_max = range_min;
    }
    
    dm.getHeaders(group_id, range_min, range_max, function(err, heads) {
        if (err) {
            callback(makeReport(err, session), nntpCode._403_fuckup);
            return;
        }
        
        if (!heads.length) {
            callback(makeReport('No such Article: ' + cmd.all, session),
                nntpCode._423_no_article_in_group);
            return;
        }

        reply.push(nntpCode._224_overview_info_follows);

        for(i=0; i<heads.length; i++) {
            reply.push(
                heads[i].messageid + "\t" +
                msgSubject(heads[i].title) + "\t" +
                msgFrom(heads[i].username) + "\t" +
                heads[i].gmdate + "\t" +
                msgIdString(heads[i].postid, heads[i].messagetype) + "\t" +
                msgReferers(heads[i].refid, heads[i].messagetype) +
                "\t" +  "\t" +
                msgXref(session.currentgroup, heads[i].messageid)
            );  // 2 empty tabs are for message size & message lines count
        }
                    
        reply.push(".");
        callback(null, reply);
        reply = null;
    });
};


/**
 * nntp XHRD command.
 * 
 * Similar to XOVER, but returns only one header, instead of all.
 * Also have additional param, defining header type.
 * 
 * additional params:
 * 
 *      <head> <range>
 */          
var cmdXhdr = function(cmd, session, callback) {
    var reply = [];
    var range_min, range_max;
    var sub_cmd, sub_params;

    if (session.currentgroup === '') {
        callback(null, nntpCode._412_newsgroup_notselected);
        return;
    }
    
    sub_cmd = (cmd.params.split(' ', 1)[0]).toUpperCase();
    sub_params = cmd.params.slice(sub_cmd.length).trimLeft();

    // check if supported header requested
    if(!/^(FROM|SUBJECT|MESSAGE-ID|REFERENCES|DATE)$/.test(sub_cmd)) {
        callback(makeReport('Syntax error: ' + cmd.all, session),
            nntpCode._501_syntax_error);
        return;
    }
    
    var range = sub_params.match(/^(\d+)(-)?(\d+)?$/);
        
    if(!range) {
        callback(makeReport('Range error: ' + cmd.all, session),
            nntpCode._420_article_notselected);
        return;
    }
        
    var group_id = session.groups[session.currentgroup].id;
    
    //  xx-yy, xx-, xx
    range_min = range[1];
    if (range[2]) {
        range_max = range[3] || session.groups[session.currentgroup].last;
    } else {
        range_max = range_min;
    }
    
    dm.getHeaders(group_id, range_min, range_max, function(err, heads) {
        var i;
        
        if (err) {
            callback(makeReport(err, session), nntpCode._403_fuckup);
            return;
        }

        if (!heads.length) {
            callback(makeReport('No such Article: ' + cmd.all, session),
                nntpCode._423_no_article_in_group);
            return;
        }

        reply.push(nntpCode._221_xhdr_head_follows);

        for(i=0; i<heads.length; i++) {
            var hdr;
            
            switch (sub_cmd) {
                case 'FROM':
                    hdr = msgFrom(heads[i].username);
                    break;
                case 'SUBJECT':
                    hdr = msgSubject(heads[i].title);
                    break;
                case 'MESSAGE-ID':
                    hdr = msgIdString(heads[i].postid, heads[i].messagetype);
                    break;
                case 'REFERENCES':
                    hdr = msgReferers(heads[i].refid, heads[i].messagetype);
                    break;
                case 'DATE':
                    hdr = heads[i].gmdate;
                    break;
                default :
                    hdr = '';
            }
            
            reply.push(heads[i].messageid + ' ' + hdr);
        }
                    
        reply.push(".");
        callback(null, reply);
        reply = null;
    });
};


/**
 * nntp XOVER command
 * 
 * additional params:
 * 
 *      <range>
 * 
 *      XX-YY   - from XX to YY
 *      XX-     - from XX to end
 *      XX      - only XX
 * 
 *      (!) text message id can be used, but not implemented
 * 
 * replies:
 * 
 *      see rfc :)
 */          
var cmdListGroup = function(cmd, session, callback) {
    var reply = [];
    var range_min, range_max, i;

    // Extract group name and range (if exists)
    var group = (cmd.params.split(' ', 1)[0]);
    var sub_params = cmd.params.slice(group.length).trimLeft();

    // We don't support [range] param, report error
    if (!!sub_params) {
        callback(makeReport('Syntax error: ' + cmd.all, session),
            nntpCode._501_syntax_error);
        return;
    }

    dm.fillGroupsList(session, function(err) {
        if (err) {
            callback(makeReport(err, session), nntpCode._403_fuckup);
            return;
        }

        if (!session.groups[group]) {
            callback(null, nntpCode._411_newsgroup_notfound);
            return;
        }
        
        range_min = session.groups[group].first;
        range_max = session.groups[group].last;
             
        var group_id = session.groups[group].id;

        // We can use more effective request, to get ids only. But who cares?
        // Command is quire rare, so no need to optimize now.
        dm.getHeaders(group_id, range_min, range_max, function(err, heads) {
            if (err) {
                callback(makeReport(err, session), nntpCode._403_fuckup);
                return;
            }

			reply.push(nntpCode._211_group_selected +
						session.groups[group].count + ' ' +
						session.groups[group].first + ' ' +
						session.groups[group].last + ' ' +
						group + 'list follows'
			);
			
            session.currentgroup = group;
            
            for(i=0; i<heads.length; i++) {
                reply.push(heads[i].messageid);
            }
                        
            reply.push(".");
            callback(null, reply);
            reply = null;
        });
    });
};


/**
 * nntp ARTICLE, BODY, HEAD commands
 * 
 * additional params:
 * 
 *      <article id>
 * 
 *      (!) we implement ONLY digital id. It can also be
 *      empty or string, according to rfc.
 */      
var cmdArticle = function(cmd, session, callback) {
    var reply = [];
 
    if (session.currentgroup === '') {
        callback(null, nntpCode._412_newsgroup_notselected);
        return;   
    }
    // Expect only digit in parameter now
    if (!/^\d+$/.test(cmd.params)) {
        callback(makeReport('Range error: ' + cmd.all, session),
            nntpCode._420_article_notselected);
        return;
    }

    var article_id = cmd.params;
    var group_id = session.groups[session.currentgroup].id;

    dm.getArticle(group_id, article_id, function(err, article) {
        if (err) {
            callback(makeReport(err, session), nntpCode._403_fuckup);
            return;
        }
        if (!article) {
            callback(null, nntpCode._423_no_article_in_group);
            return;
        }

        var reply_code;

        if (cmd.code === 'ARTICLE') {
            reply_code = nntpCode._220_article_follows;
        }  
        if (cmd.code === 'HEAD') {
            reply_code = nntpCode._221_head_follows;
        }  
        if (cmd.code === 'BODY') {
            reply_code = nntpCode._222_body_follows;
        }
                
        reply.push(reply_code + article_id + ' ' +
            msgIdString(article.postid, article.messagetype) + ' article');

        // Add headers
        if (cmd.code === 'ARTICLE' || cmd.code === 'HEAD') {
            reply = reply.concat(msgHeaders(article, session));
        }

        // Add message body
        if (cmd.code === 'ARTICLE' || cmd.code === 'BODY') {
            if(cmd.code === 'ARTICLE') {
                reply.push('');     // empty string between headers & body
            }
            reply = reply.concat(msgBody(article, session));
        } 
        reply.push('.');  
        callback(null, reply);
        reply = null;
    });
};

var nntpNoAuth = {
    HELP : cmdHelp,
    QUIT : cmdQuit,
    DATE : cmdDate,
    AUTHINFO : cmdAuthinfo,
    MODE : cmdMode
};

var nntpWithAuth = {
    LIST : cmdList,
    NEWGROUPS : cmdNewGroups,
    GROUP : cmdGroup,
    LISTGROUP : cmdListGroup,
    XOVER : cmdXover,
    XHDR  : cmdXhdr,
    ARTICLE : cmdArticle,
    HEAD : cmdArticle,
    BODY : cmdArticle    
};

/**
 * Main call to process all commands 
 */
exports.executeCommand = function(command, session, callback) { 

    var cmd = {};

    cmd.all = command;
    cmd.code = (command.split(' ', 1)[0]).toUpperCase();
    cmd.params = command.slice(cmd.code.length).trimLeft();

    if (nntpWithAuth[cmd.code] !== undefined) {
        // userid = 0 -> authorisation not passed yet
        if (session.userid) {
            nntpWithAuth[cmd.code](cmd, session, callback);
        } else {
            callback(null, nntpCode._480_auth_required); 
        }
    } else if (nntpNoAuth[cmd.code] !== undefined) {
        nntpNoAuth[cmd.code](cmd, session, callback);
    } else {
        callback(makeReport('unknown command: ' + cmd.all, session),
            nntpCode._500_cmd_unknown);
    }
};
