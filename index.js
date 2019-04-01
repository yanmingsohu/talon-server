const service = require('./service-fs.js');
const dish    = require('dish-lib');
const plib    = require('path');
const crypto  = require('crypto');
const Dir     = require('./dir.js');
const conflib = require('configuration-lib');
const http    = require('http');
const logger  = console; //require('logger-lib')('nfs');
const mixer   = require('mixer-lib');
const mime    = require('mime');

mime.lookup = mime.getType;

const nfs     = new Dir();
const context = {};
const session = dish.session_store.mem();

const nextor = function(req, resp) {
  return function(err, data) {};
};

mixer.auto_init(whenLoad, {});

function whenLoad(app_pool, exdata, config) {
  config.session_pass = crypto.randomBytes(24).toString('base64');
  const staticpage = mixer.util.mid().ex_static(config.talon_path, '/page');
  app_pool.addApp(staticpage, '/page');

  dish.filter(auth);
  dish.filter(redis);
  dish.filter(safe_path);

  const container = dish.create(config.base_url, context, nextor);
  service(container, logger, session, config, nfs);

  container.forMixer(app_pool);
  
  console.log("http://localhost:"+ config.port +
    "/page/index.html?init_service=/talon/init_service");
}


function auth(conf) {
  return function(req, resp, next) {
    // 无权限检查, 任何人都可以访问
    next();
  }
}


function redis(conf) {
  return function(req, resp, next) {
    // 没有绑定任何 redis 上下文
    next();
  }
}


function safe_path(conf) {
  return function(req, resp, next) {
    // 没有做路径安全检查
    next();
  }
}