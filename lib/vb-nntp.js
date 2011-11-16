var nntp = require('./vb-nntp/nntp'),
    nntps = require('./vb-nntp/nntps'),
    logger = require('./vb-nntp/logger'),
    debug = logger.dummy.debug;


function postInitServer(server, options) {
  debug('SERVER Post-init configuration');

  server.maxConnections = +options.max_conn || 50;
  server.connectionTimeout = (+options.timeout || 60) * 1000;
  server.logger = logger.create(options.logger);

  return server;
}


module.exports.createServer = function (options) {
  debug('SERVER Start plain server');
  return postInitServer(new nntp.Server(), options);
};


module.exports.createSecureServer = function (options) {
  debug('SERVER Start secure server');
  return postInitServer(new nntps.Server({
    key: options.pem_file,
    cert: options.pem_file
  }), options);
};


////////////////////////////////////////////////////////////////////////////////
// vim:ts=2:sw=2
////////////////////////////////////////////////////////////////////////////////
