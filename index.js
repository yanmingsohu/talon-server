const service = require('./service-fs.js');
const dish    = require('dish-lib');
const plib    = require('path');
const logger  = console; //require('logger-lib')('nfs');


var context = {};
var nextor = function(req, resp) {
  return Function(err, data) {};
};

var container = dish.create('/talon', context, nextor);
service(container, logger, 'mem', {}, null, nfs);