/*var COMMANDS = {};
var Executor = module.exports = function Executor(dbm, log) {
  if (!(this instanceof Executor)) {
    return new Executor(dbm, log);
  }

  this._dbm = dbm;
  this._log = log;
}


Executor.create = function (dbm, log) {
  return new Executor(dbm, log);
}


Executor.prototype.cmdArticle = function (req, res) {
	var self = this;

  if (!req.session.group_id) {
    res.end('412 No newsgroup has been selected');
    return;
  }

  this._dbm.getArticle(req.session.group_id, req.params, function (err, article) {
    if (err) {
      res.end('503 Internl error. Command not performed');
      return;
    }

    if (!article) {
      res.end('423 No such article number in this group');
      return;
    }

    res.end('500 Not implemented yet');
  });
};


Executor.prototype.executeCommand(req, res) {
  var next, i, l
  if (undefined === Executor.commands[req.command]) {
    res.end("500 Unknown command");
    return;
  }

  for (i = 0, l = COMMANDS[req.command].length; i < l; i++) {
    if (null === COMMANDS[req.command][i][0] || COMMANDS[req.command][i][0].test(req.params)) {
      COMMANDS[req.command][i][1].call(this, req, res);
      return;
    }
  }

  res.end("501 Command syntax error");
};


function addCommand(name, paramsRegExp, handler) {
  if (undefined === COMMANDS[name]) {
    COMMANDS[name] = [];
  }

  COMMANDS[name].push([paramsRegExp || null, handler]);
}


addCommand('ARTICLE', /^\d+$/, Executor.prototype.cmdArticle);
*/

////////////////////////////////////////////////////////////////////////////////
// vim:ts=2:sw=2
////////////////////////////////////////////////////////////////////////////////
