module.exports = {
  logger : {
    // ALL, TRACE, DEBUG, INFO, WARN, ERROR, FATAL, MARK, OFF
    logLevel : 'ALL',

    // 相对于项目目录的日志文件目录, 也可使用绝对目录
    log_dir  : 'logs',

    // 如果目录不存在, 则创建(迭代)
    create_dir : true,

    // 达到 log_size 后文件分块
    log_size : 20 * 1024 * 1024, // 20MB

    // 文件分块后, 最多保留几个分块文件
    reserve_count : 10,
  },

  local_fs : [
    { fsid : 'server', name: 'server', 
      base: __dirname +'/../' },
      
    { fsid : 'talon', name: 'talon', 
      base: '/Nodejs_Projects/person/davinci.prj/www/talon' },
  ],

  talon_path: '/Nodejs_Projects/person/davinci.prj/www/talon',
  base_url : '/talon',
  port: 88,
};

console.log(module.exports.local_fs)