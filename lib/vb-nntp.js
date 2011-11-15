var nntp = require('./vb-nntp/nntp'),
    nntps = require('./vb-nntp/nntps'),
    database = require('./vb-nntp/database'),
    executor = require('./vb-nntp/executor');



function postInitServer(server, options) {
  var dbm = database.create(options);

  server.maxConnections = +options.max_conn || 50;
  server.connectionTimeout = (+options.timeout || 60) * 1000;

  server.commandProcessor = executor.create(dbm).executeCommand;

  return server;
}


module.exports.createServer = function (options) {
  return postInitServer(new nntp.Server(), options);
};


module.exports.createSecureServer = function (options) {
  return postInitServer(new nntps.Server({
    key: options.pem_file,
    cert: options.pem_file
  }), options);
};


////////////////////////////////////////////////////////////////////////////////
// vim:ts=2:sw=2
////////////////////////////////////////////////////////////////////////////////
