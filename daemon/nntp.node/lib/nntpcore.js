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
var msgReferers = function(refererId) {
    return refererId + '.ref@' + config.vars.GateId;
};


/**
 * Build message id string as "<messageid>@<gateid>"
 * Example: "5902@example.com"
 */
var msgIdString = function(msgId) {
    return msgId + '@' + config.vars.GateId;
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
 * Build body for ARTICLE & BODY commands
 */
var msgBody = function(article, session) {
    var body = [];

    var menu = session.menu.split('<% POST ID %>').join(article.postid)
                            .split('<% THREAD ID %>').join(article.refid);
    
    var parsed = session.template.replace('<% CSS %>', session.css)
            .replace('<% USER MENU %>', menu)         
            .replace('<% MESSAGE BODY %>', article.body);
        
    parsed = (new Buffer(parsed, 'utf8')).toString('base64');

    // Cut long base64 string for short peaces
    var currentPos = 0;
    while (parsed.length > currentPos) {
        body.push(parsed.slice(currentPos, currentPos + 76));
        currentPos += 76;
    }

    return body;
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
    headers.push("Message-ID: <" +  msgIdString(article.postid) + ">");
    headers.push("References: <" +  msgReferers(article.refid) + ">");
    headers.push("Content-Type: text/html; charset=utf-8");
    headers.push("Content-Transfer-Encoding: base64");
    headers.push("Charset: utf-8");
    headers.push("Xref: " + config.vars.ForumUrl + " " + session.currentgroup + ":" + article.messageid);       
    
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
};


/**
 * nntp QUIT command
 * 
 *  reply: 205 closing connection - goodbye! 
 */         
var cmdQuit = function(cmd, session, callback) {
    callback(null, nntpCode._205_goodbye, true); 
};


/**
 * DATE
 * 
 * reply: server date and time (UTC).
 * 
 *      111 yyyymmddhhmmss
 */
var cmdDate = function(cmd, session, callback) {
    function pad(n) {
        return n < 10 ? '0' + n.toString(10) : n.toString(10);
    }
    
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
        callback(makeReport('Syntax error: ' + cmd.all, session),
            nntpCode._501_syntax_error);
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

        if (session.groups[cmd.params]) {
            session.currentgroup = cmd.params;
            callback(null, nntpCode._211_group_selected +
                        session.groups[cmd.params].count + ' ' +
                        session.groups[cmd.params].first + ' ' +
                        session.groups[cmd.params].last + ' ' +
                        session.currentgroup
            );
        }
        else {
            callback(null, nntpCode._411_newsgroup_notfound);
        }
    });
};


/**
 * nntp XOVER commant
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
    var range_min, range_max;

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
    
    dm.getXover(group_id, range_min, range_max, function(err, xover) {
        if (err) {
            callback(makeReport(err, session), nntpCode._403_fuckup);
            return;
        }
        
        if (!xover.length) {
            callback(makeReport('No such Article: ' + cmd.all, session),
                nntpCode._423_no_article_in_group);
            return;
        }

        reply.push(nntpCode._224_overview_info_follows);

        for(var i=0; i<xover.length; i++) {
            reply.push(
                xover[i].messageid + "\t" +
                msgSubject(xover[i].title) + "\t" +
                msgFrom(xover[i].username) + "\t" +
                xover[i].gmdate + "\t" +
                "<" + msgIdString(xover[i].postid) + ">\t" +
                msgReferers(xover[i].refid) +
                "\t" +  "\t" + "\t"
            );  // ?? Last 2 tabs for bytes count & lines
                // count. Reread RFC 977 & 3977,  
        }
                    
        reply.push(".");
        callback(null, reply);
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
    
    // use the same data, as for xover
    dm.getXover(group_id, range_min, range_max, function(err, xover) {
        if (err) {
            callback(makeReport(err, session), nntpCode._403_fuckup);
            return;
        }

        if (!xover.length) {
            callback(makeReport('No such Article: ' + cmd.all, session),
                nntpCode._423_no_article_in_group);
            return;
        }

        reply.push(nntpCode._221_xhdr_head_follows);

        for(var i=0; i<xover.length; i++) {
            var hdr;
            
            switch (sub_cmd) {
                case 'FROM':
                    hdr = msgFrom(xover[i].username);
                    break;
                case 'SUBJECT':
                    hdr = msgSubject(xover[i].title);
                    break;
                case 'MESSAGE-ID':
                    hdr = '<' + msgIdString(xover[i].postid) + '>';
                    break;
                case 'REFERENCES':
                    hdr = msgReferers(xover[i].refid);
                    break;
                case 'DATE':
                    hdr = xover[i].gmdate;
                    break;
                default :
                    hdr = '';
            }
            
            reply.push(xover[i].messageid + ' ' + hdr);
        }
                    
        reply.push(".");
        callback(null, reply);
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
        if (err)
        {
            callback(makeReport(err, session), nntpCode._403_fuckup);
            return;
        }
        if (!article) {
            callback(null, nntpCode._423_no_article_in_group);
            return;
        }

        var reply_code;

        if (cmd.code == 'ARTICLE') {
            reply_code = nntpCode._220_article_follows;
        }  
        if (cmd.code == 'HEAD') {
            reply_code = nntpCode._221_head_follows;
        }  
        if (cmd.code == 'BODY') {
            reply_code = nntpCode._222_body_follows;
        }
                
        reply.push(reply_code + article_id + ' <' +
            msgIdString(article.postid) + '>');

        // Add headers
        if (cmd.code == 'ARTICLE' || cmd.code == 'HEAD') {
            reply = reply.concat(msgHeaders(article, session));
        }

        // Add message body
        if (cmd.code == 'ARTICLE' || cmd.code == 'BODY') {
            if(cmd.code == 'ARTICLE') {
                reply.push('');     // empty string between headers & body
            }
            reply = reply.concat(msgBody(article, session));
        } 
        reply.push('.');  
        callback(null, reply);
    });
};

/**
 * Main call to process all commands 
 */
exports.executeCommand = function(command, session, callback) { 
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
        XOVER : cmdXover,
        XHDR  : cmdXhdr,
        ARTICLE : cmdArticle,
        HEAD : cmdArticle,
        BODY : cmdArticle    
    };

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
