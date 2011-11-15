var nntp = require('./vb-nntp/nntp'),
    nntps = require('./vb-nntp/nntps'),
    executor = require('./vb-nntp/executor'),
    database = require('./vb-nntp/database'),
    logger = require('./vb-nntp/logger');


function requestHandler(options) {
  var log = logger.create(options.logger),
      dbm = database.create(options.database);
  return executor.create(dbm, log).execute;
}


module.exports.createServer = function (options) {
  return nntp.createServer(options, requestHandler(options));
};


module.exports.createSecureServer = function (options) {
  return nntps.createServer(options, requestHandler(options));
};


////////////////////////////////////////////////////////////////////////////////
// vim:ts=2:sw=2
////////////////////////////////////////////////////////////////////////////////
