/**
 * NNTP daemon main file
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

var net = require('net');
var tls = require('tls');
var fs = require('fs');

var config = require('./lib/config.js'); 
var nntpCore = require('./lib/nntpcore.js'); 
var logger = require('./lib/logger.js');

var nntpDaemon = [];

var CRLF = '\r\n';

var conListener = function (stream) {

    stream.setNoDelay();
    stream.setTimeout(config.vars.InactiveTimeout*1000);

    // User info and config
    stream.session = {};
    stream.session.ip = stream.remoteAddress;
    stream.session.currentgroup = "";       // selected group name
    stream.session.userid = 0;  
    stream.session.username = '';
    stream.session.password = '';
    stream.session.css = '';
    stream.session.menu = '';
    stream.session.template = '';  
    // User accessible groups
    // [name] -> (id, count, first, last, permissions)
    stream.session.groups = {};
    stream.session.group_ids_str = '';      // "2,5,7,8,9,15,..."

    /* Standard connection events */
    
    stream.on('connect', function () {
        stream.write("201 server ready - no posting allowed" + CRLF); 
    });

    // Close connection on long idle
    stream.on('timeout', function () {
        stream.destroy();
    });

    // Catch error, if client terminates connection during reply
    stream.on('error', function () {
        stream.destroy();
    });

    // Free session objects
    stream.on('close', function () {
		stream.session.groups =null;
        stream.session = null;
    });

    
    // Received NNTP command from client (data string) 
    stream.on('data', function (data) {
        var command = data.toString().trimLeft().replace(/\s+$/, '');

        var msg = /^AUTHINFO PASS/i.test(command) ? 'AUTHINFO PASS *****' : command;
        logger.write('cmd', "C --> " + msg, stream.session);

        nntpCore.executeCommand(command, stream.session, function(err, reply, finish) {
            finish = finish || false;   // = 1 if connect should be closed
            var response = '';
            
            if (err) {
                logger.write('error', err, stream.session);
            }

            if (reply) {
                // Check if we have string or array of strings
                if (Array.isArray(reply)) {
                    response = reply.join(CRLF) + CRLF;
                } else {
                    response = reply + CRLF;
                }
                stream.write(response);
                
                logger.write('reply', reply, stream.session); 
            }
            
            response = null;
            
            if (finish) { stream.end();  }
        });
    });
};


// Global events handlers

process.on('uncaughtException', function(err) {
    logger.write('error', '!! Unhandled exception !!');
    logger.write('error', err);
});

process.on('exit', function () {
    logger.write('info', 'vb NNTP daemon stopped');
    logger.close();
});

process.on('SIGHUP', function () {
	var connections = 0;
	var i;
	
	for(i=0; i<nntpDaemon.length; i++) {
		connections += nntpDaemon[i].connections;
	}
	
	logger.write('info', 'Current connections: ' + connections);

    logger.reopen();
});


// Init & start listening

try {
    config.load();
} catch (e) {
    console.log(e.message);
    process.exit(1);
}

logger.init();

var cfg = config.vars;

process.title = cfg.DaemonTitle;

if (cfg.DaemonPort) {
    var server = net.createServer(conListener);
    server.maxConnections = cfg.MaxClients;
    try {
        server.listen(cfg.DaemonPort, cfg.DaemonHost);
    } catch (e) {
        console.log('Failed to bind port - already in use.');
        process.exit(2);
    }
    nntpDaemon.push(server);
}
// this not yet work with new ssl framework
// use stunnel4 now.
if (cfg.DaemonSslPort) {
    var options = {
        key: fs.readFileSync(cfg.PemFile),
        cert: fs.readFileSync(cfg.PemFile)
    };

    var ssl_server = tls.createServer(options, conListener);
    ssl_server.maxConnections = cfg.MaxClients;
    try {
        ssl_server.listen(cfg.DaemonSslPort, cfg.DaemonHost);
    } catch (e) {
        console.log('Failed to bind port - already in use.');
        process.exit(2);
    }
    nntpDaemon.push(ssl_server);
}

logger.write('info', 'vb NNTP daemon started');

