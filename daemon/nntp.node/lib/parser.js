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
var s = require('./session.js'); 

// Local temporary vars. Make shure, that access is always atomic,
// and not interrupted by functions with callbacks 
var reply = []; // server reply
var buf = new Buffer(65535);



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

function nntpParser(socket) {
	if (!(this instanceof nntpParser)) { return new nntpParser(socket); }
	
	this.session = s.Session(socket);
}

/**
 * Make report - exception with session details
 * 
 * @param {String|Error} err    Text string or Exception
 * @param {Object} session      User session
 * 
 * @return {Object} Error with session details
 */
nntpParser.prototype.makeReport = function(err) {
    if (!err) {
        return null;
    }
    
    var result = (err instanceof Error) ? err : Error(err);
    
    if (!!this.session) {
        if (this.session.username) {
			result.username = this.session.username;
		}
        if (this.session.userid) {
			result.user_id = this.session.userid;
		}
        result.ip = this.session.ip;
        if (!!this.session.current) {
			result.currentgroup = this.session.current;
		}
    }

    return result;
};


/**
 * Replace HTML special char
 */
nntpParser.prototype.unescapeHTML = function(str) {
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
nntpParser.prototype.msgReferers = function(refererId, msgType) {
    return '<' +refererId + '.' + msgType + '.ref@' + config.vars.ForumHost + '>';
};


/**
 * Build message id string as "<messageid>@<gateid>"
 * Example: "5902@example.com"
 */
nntpParser.prototype.msgIdString = function(msgId, msgType) {
    return '<' + msgId + '.' + msgType + '@' + config.vars.ForumHost + '>';
};


/**
 * Build message field "From" (UTF-8, Base64 encoding)
 */          
nntpParser.prototype.msgFrom = function(username) {
    return '=?UTF-8?B?' +
        buf.toString('base64', 0, buf.write(this.unescapeHTML(username), 0)) +
        '?=' +
        ' <no_reply@rcdesign.ru>';
};


/**
 * Build message "Subject" (UTF-8, Base64 encoding)
 */      
nntpParser.prototype.msgSubject = function(subject) {
    return '=?UTF-8?B?' +
        buf.toString('base64', 0, buf.write(this.unescapeHTML(subject), 0)) +
        '?=';
};


/**
 * Build message field Xref
 * Example: your.nntp.com cool.sex.binary:3748
 */      
nntpParser.prototype.msgXref = function(group, msgId) {
    return 'Xref: ' + config.vars.ForumHost + " " + group + ':' + msgId;
};


/**
 * Build body for ARTICLE & BODY commands
 */
nntpParser.prototype.msgBody = function(article) {

    var menu = this.session.menu.split('<% POST ID %>').join(article.postid)
                            .split('<% THREAD ID %>').join(article.refid);
    
    var parsed = this.session.template.replace('<% CSS %>', this.session.css)
            .replace('<% USER MENU %>', menu)         
            .replace('<% MESSAGE BODY %>', article.body);
        
    // Cut long base64 string for short peaces
    // -- DON'T -- switch to plain text without tests on production!
    // Thunderbird seems to reload all plain messages in synced groups
    // for offline. No ideas why. Base64 partly solved problem.
    
	var body = [];
    parsed = buf.toString('base64', 0, buf.write(parsed, 0));

    var currentPos = 0;
    while (parsed.length > currentPos) {
        body.push(parsed.slice(currentPos, currentPos + 76));
        currentPos += 76;
    }
    return body;
/*
    // Without base64
    // Rip out \r if exists, then split by \n
    return parsed.replace(/\r/g,'').split('\n');
*/
};


/**
 * Build headers for ARTICLE & HEAD commands
 */
nntpParser.prototype.msgHeaders = function(article) {
    var headers = [];

    headers.push("From: " +         this.msgFrom(article.username));
    headers.push("Newsgroups: " +   this.session.current);
    headers.push("Subject: " +      this.msgSubject(article.subject));
    headers.push("Date: " +         article.gmdate);  // ??? .replace("+00:00", "+03:00")
    headers.push("Message-ID: " +   this.msgIdString(article.postid, article.messagetype));
    headers.push("References: " +  this.msgReferers(article.refid, article.messagetype));
    headers.push("Content-Type: text/html; charset=utf-8");
    headers.push("Content-Transfer-Encoding: base64");
//    headers.push("Content-Transfer-Encoding: 8bit");
    headers.push("Charset: utf-8");
    headers.push(this.msgXref(this.session.current, article.messageid));       
    
    return headers;
};


/**
 * nntp HELP command
 * 
 * reply: 100 help text
 */      
nntpParser.prototype.cmdHelp = function(cmd, callback) {
    reply = [];
    reply.push(nntpCode._100_help_follows);
    reply.push(".");

    callback(null, reply);
};


/**
 * nntp QUIT command
 * 
 *  reply: 205 closing connection - goodbye! 
 */         
nntpParser.prototype.cmdQuit = function(cmd, callback) {
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
nntpParser.prototype.cmdDate = function(cmd, callback) {
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
nntpParser.prototype.cmdAuthinfo = function(cmd, callback) {
	var self = this;
	
    var parced;

    // Disable command after success. See RFC 4643
    // http://tools.ietf.org/html/rfc4643
    if (this.session.userid) {
        callback(null, nntpCode._502_cmd_unavailable);
        return;
    }
    
    parced = cmd.params.match(/^user\s+(.+)/i);  // username
    if (parced) {
        this.session.set({ username : parced[1] });
        callback(null, nntpCode._381_auth_required);
        return;
    }
    
    parced = cmd.params.match(/^pass\s+(.+)/i);  // password
    if (parced) {
        if (this.session.username === '') {
            callback(null, nntpCode._482_auth_out_of_sequence);
            return;
        }

        this.session.set({ password : parced[1] });
        dm.checkAuth(this.session, function(err, verifyed) {
            if (err) {
                callback(self.makeReport(err), nntpCode._403_fuckup);
                return;
            }
                
            if (verifyed) {
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
nntpParser.prototype.cmdMode = function(cmd, callback) {
    if (cmd.params.match(/^reader$/i)) {
        callback(null, nntpCode._201_srv_ready_ro);
    } else {
        callback(this.makeReport('Syntax error: ' + cmd.all),
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
nntpParser.prototype.cmdList = function(cmd, callback) {
	var self = this;
	
    if (cmd.params) {
        callback(this.makeReport('Syntax error: ' + cmd.all),
            nntpCode._501_syntax_error); // fuckup LIST extentions
        return;
    }

    dm.getGroupsStat(this.session.grp_ids, function(err, rows) {
       if (err) {
            callback(self.makeReport(err), nntpCode._403_fuckup);
            return;
        }

        reply = [];

        reply.push(nntpCode._215_info_follows);

        var groups = self.session.groups;
        Object.keys(groups).forEach(function(name, index, array) {
            var first, last;
            if (rows[groups[name]]) {
                first = rows[groups[name]].first || 0;
                last = rows[groups[name]].last || 0;
            } else {
                first = 0;
                last = 0;
            }
            reply.push( name + ' ' + last + ' ' + first + ' ' + 'n' );
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
nntpParser.prototype.cmdNewGroups = function(cmd, callback) {
	var self = this;
	
    var params = cmd.params.match(/^(\d{6}|\d{8})\s+(\d{6})(\s+gmt)?$/i);

    if (params) {
        // ignore GMT param - nothing useful 
        var date = params[1].match(/^(\d+)(\d{2})(\d{2})$/);
        var time = params[2].match(/^(\d{2})(\d{2})(\d{2})$/);
        
        var datetime =  date[1] + '-' + date[2] + '-' + date[3] + ' ' +
                        time[1] + ':' + time[2] + ':' + time[3];

        dm.getNewGroups(this.session.grp_ids, datetime, function(err, rows) {
            if (err) {
                callback(self.makeReport(err), nntpCode._403_fuckup);
                return;
            }

            reply = [];
        
            reply.push(nntpCode._231_newgroups_follows);

            var groups = self.session.groups;
            Object.keys(groups).forEach(function(name, index, array) {
                var id = groups[name];
                if (!!rows[id]) {
                    reply.push( name + ' ' + rows[id].last + ' ' +
                        rows[id].first + ' ' + 'n' );
                }
            });
            
            reply.push(".");
            callback(null, reply);
        });
    } else {
        callback(this.makeReport('Syntax error: ' + cmd.all),
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
nntpParser.prototype.cmdGroup = function(cmd, callback) {
	var self = this;
	
    if (!self.session.groups[cmd.params]) {
        callback(null, nntpCode._411_newsgroup_notfound);
        return;
    }

    var group_id = this.session.groups[cmd.params];
    
    dm.getGroupInfo(group_id, function(err, info) {
        if (err) {
            callback(self.makeReport(err), nntpCode._403_fuckup);
            return;
        }

        var first, last, total;
        
        if (!!info) {
            first = info.first || 0;
            last = info.last || 0;
            total = info.total || 0;
        } else {
            first = last = total = 0;
        }

        self.session.set({ current : cmd.params,
                    first : first,
                    last : last });
           
        callback(null, nntpCode._211_group_selected +
                    total + ' ' +
                    first + ' ' +
                    last + ' ' +
                    cmd.params
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
nntpParser.prototype.cmdXover = function(cmd, callback) {
	var self = this;
	
    var range_min, range_max, i;

    if (self.session.current === '') {
        callback(null, nntpCode._412_newsgroup_notselected);
        return;
    }
    
    var range = cmd.params.match(/^(\d+)(-)?(\d+)?$/);
        
    if(!range) {
        callback(this.makeReport('Range error: ' + cmd.all),
            nntpCode._420_article_notselected);
        return;
    }
        
    var group_id = this.session.groups[this.session.current];

    //  xx-yy, xx-, xx
    range_min = +range[1];
    if (range[2]) {
        range_max = +(range[3] || this.session.last);
    } else {
        range_max = range_min;
    }
    
    dm.getHeaders(group_id, range_min, range_max, function(err, heads) {
        if (err) {
            callback(self.makeReport(err), nntpCode._403_fuckup);
            return;
        }
        
        if (!heads.length) {
            callback(self.makeReport('No such Article: ' + cmd.all),
                nntpCode._423_no_article_in_group);
            return;
        }

        reply = [];

        reply.push(nntpCode._224_overview_info_follows);

        for(i=0; i<heads.length; i++) {
            reply.push(
                heads[i].messageid + "\t" +
                self.msgSubject(heads[i].title) + "\t" +
                self.msgFrom(heads[i].username) + "\t" +
                heads[i].gmdate + "\t" +
                self.msgIdString(heads[i].postid, heads[i].messagetype) + "\t" +
                self.msgReferers(heads[i].refid, heads[i].messagetype) +
                "\t" +  "\t" +
                self.msgXref(self.session.current, heads[i].messageid)
            );  // 2 empty tabs are for message size & message lines count
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
nntpParser.prototype.cmdXhdr = function(cmd, callback) {
	var self = this;
	
    var range_min, range_max;
    var sub_cmd, sub_params;

    if (this.session.current === '') {
        callback(null, nntpCode._412_newsgroup_notselected);
        return;
    }
    
    sub_cmd = (cmd.params.split(' ', 1)[0]).toUpperCase();
    sub_params = cmd.params.slice(sub_cmd.length).trimLeft();

    // check if supported header requested
    if(!/^(FROM|SUBJECT|MESSAGE-ID|REFERENCES|DATE)$/.test(sub_cmd)) {
        callback(this.makeReport('Syntax error: ' + cmd.all),
            nntpCode._501_syntax_error);
        return;
    }
    
    var range = sub_params.match(/^(\d+)(-)?(\d+)?$/);
        
    if(!range) {
        callback(this.makeReport('Range error: ' + cmd.all),
            nntpCode._420_article_notselected);
        return;
    }
        
    var group_id = this.session.groups[this.session.current];
    
    //  xx-yy, xx-, xx
    range_min = +range[1];
    if (range[2]) {
        range_max = +(range[3] || this.session.last);
    } else {
        range_max = range_min;
    }
    
    dm.getHeaders(group_id, range_min, range_max, function(err, heads) {
        if (err) {
            callback(self.makeReport(err), nntpCode._403_fuckup);
            return;
        }

        if (!heads.length) {
            callback(self.makeReport('No such Article: ' + cmd.all),
                nntpCode._423_no_article_in_group);
            return;
        }

        reply = [];
        reply.push(nntpCode._221_xhdr_head_follows);

        var i;
        for(i=0; i<heads.length; i++) {
            var hdr;
            
            switch (sub_cmd) {
                case 'FROM':
                    hdr = self.msgFrom(heads[i].username);
                    break;
                case 'SUBJECT':
                    hdr = self.msgSubject(heads[i].title);
                    break;
                case 'MESSAGE-ID':
                    hdr = self.msgIdString(heads[i].postid, heads[i].messagetype);
                    break;
                case 'REFERENCES':
                    hdr = self.msgReferers(heads[i].refid, heads[i].messagetype);
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
nntpParser.prototype.cmdListGroup = function(cmd, callback) {
	var self = this;
	
    // Extract group name and range (if exists)
    var group = (cmd.params.split(' ', 1)[0]);
    var sub_params = cmd.params.slice(group.length).trimLeft();

    // We don't support [range] param, report error
    if (!!sub_params) {
        callback(this.makeReport('Syntax error: ' + cmd.all),
            nntpCode._501_syntax_error);
        return;
    }

    if (!this.session.groups[group]) {
        callback(null, nntpCode._411_newsgroup_notfound);
        return;
    }

    var group_id = this.session.groups[group];

    dm.getGroupInfo(group_id, function(err, info) {
        if (err) {
            callback(self.makeReport(err), nntpCode._403_fuckup);
            return;
        }

        var first, last, total;
        
        if (!!info) {
            first = info.first || 0;
            last = info.last || 0;
            total = info.total || 0;
        } else {
            first = last = total = 0;
        }

        // We can use more effective request, to get ids only. But who cares?
        // Command is quire rare, no need to optimize now.
        dm.getHeaders(group_id, first, last, function(err, heads) {
            if (err) {
                callback(self.makeReport(err), nntpCode._403_fuckup);
                return;
            }

            reply = [];
			reply.push(nntpCode._211_group_selected +
						total + ' ' +
						first + ' ' +
						last + ' ' +
						group + 'list follows'
			);
			
            self.session.set({ current : group });
            
            var i;
            for(i=0; i<heads.length; i++) {
                reply.push(heads[i].messageid);
            }
                        
            reply.push(".");
            callback(null, reply);
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
nntpParser.prototype.cmdArticle = function(cmd, callback) {
	var self = this;
 
    if (this.session.current === '') {
        callback(null, nntpCode._412_newsgroup_notselected);
        return;   
    }
    // Expect only digit in parameter now
    if (!/^\d+$/.test(cmd.params)) {
        callback(this.makeReport('Range error: ' + cmd.all),
            nntpCode._420_article_notselected);
        return;
    }

    var article_id = cmd.params;
    var group_id = this.session.groups[this.session.current];

    dm.getArticle(group_id, article_id, function(err, article) {
        if (err) {
            callback(self.makeReport(err), nntpCode._403_fuckup);
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
                
        reply = [];

        reply.push(reply_code + article_id + ' ' +
            self.msgIdString(article.postid, article.messagetype) + ' article');

        // Add headers
        if (cmd.code === 'ARTICLE' || cmd.code === 'HEAD') {
            reply = reply.concat(self.msgHeaders(article));
        }

        // Add message body
        if (cmd.code === 'ARTICLE' || cmd.code === 'BODY') {
            if(cmd.code === 'ARTICLE') {
                reply.push('');     // empty string between headers & body
            }
            reply = reply.concat(self.msgBody(article));
        } 
        reply.push('.');  
        callback(null, reply);
    });
};

var nntpNoAuth = {
    HELP : 'cmdHelp',
    QUIT : 'cmdQuit',
    DATE : 'cmdDate',
    AUTHINFO : 'cmdAuthinfo',
    MODE : 'cmdMode'
};

var nntpWithAuth = {
    LIST : 'cmdList',
    NEWGROUPS : 'cmdNewGroups',
    GROUP : 'cmdGroup',
    LISTGROUP : 'cmdListGroup',
    XOVER : 'cmdXover',
    XHDR  : 'cmdXhdr',
    ARTICLE : 'cmdArticle',
    HEAD : 'cmdArticle',
    BODY : 'cmdArticle'    
};

/**
 * Main call to process all commands 
 */
nntpParser.prototype.executeCommand = function(command, callback) { 

    var cmd = {};

    cmd.all = command;
    cmd.code = (command.split(' ', 1)[0]).toUpperCase();
    cmd.params = command.slice(cmd.code.length).trimLeft();

    if (nntpWithAuth[cmd.code] !== undefined) {
        // userid = 0 -> authorisation not passed yet
        if (this.session.userid) {
            this[nntpWithAuth[cmd.code]](cmd, callback);
        } else {
            callback(null, nntpCode._480_auth_required); 
        }
    } else if (nntpNoAuth[cmd.code] !== undefined) {
        this[nntpNoAuth[cmd.code]](cmd, callback);
    } else {
        callback(this.makeReport('unknown command: ' + cmd.all),
            nntpCode._500_cmd_unknown);
    }
};

exports.nntpParser = nntpParser;
