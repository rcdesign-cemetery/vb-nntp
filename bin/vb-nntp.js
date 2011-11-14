#!/usr/bin/env node


var jsyaml = require('js-yaml'),
    VBNNTPServer = require('../lib/vb-nntp');


var options = require(/* lookup for config.yml here */),
    server = new VBNNTPServer(options);


process.on('SIGHUP', server.logger.reopen);


server.listen();
