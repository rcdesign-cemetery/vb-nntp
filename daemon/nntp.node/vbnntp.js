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
var util = require('util');

var config = require('./lib/config.js'); 
var nntpCore = require('./lib/nntpcore.js'); 
var logger = require('./lib/logger.js');
var s = require('./lib/session.js'); 

var nntpDaemon = [];

var CRLF = '\r\n';

var conListener = function (stream) {

    stream.setNoDelay();
    stream.setTimeout(config.vars.InactiveTimeout*1000);

    // create session object & store it's id
    stream.sid = s.create(stream);

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

    // Destroy session on close
    stream.on('close', function () {
		s.destroy(stream.sid);
    });

    
    // Received NNTP command from client (data string) 
    stream.on('data', function (data) {
        var command = data.toString().trimLeft().replace(/\s+$/, '');

        var msg = /^AUTHINFO PASS/i.test(command) ? 'AUTHINFO PASS *****' : command;
        logger.write('cmd', "C --> " + msg, s.get(stream.sid));

        nntpCore.executeCommand(command, s.get(stream.sid), function(err, reply, finish) {
            finish = finish || false;   // = 1 if connect should be closed
            var response = '';
            
            if (err) {
                logger.write('error', err, s.get(stream.sid));
            }

            if (reply) {
                // Check if we have string or array of strings
                if (Array.isArray(reply)) {
                    response = reply.join(CRLF) + CRLF;
                } else {
                    response = reply + CRLF;
                }
                stream.write(response);
                
                logger.write('reply', reply, s.get(stream.sid)); 
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
	
	logger.write('info', 'Stat dumped.\n' +
        'Current connections: ' + connections + '\n\n' +
        'Memory usage:\n' + util.inspect(process.memoryUsage()) + '\n\n' +
        s.dump()
    );

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
// this not yet works with new ssl framework
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

