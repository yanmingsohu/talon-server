module.exports = function services_nfs(container, logger, store, config, nfs) {
// fsid 与 hdid 意义相同


const plib      = require('path');
const localfs   = require('fs');
const mime      = require('mime');
const findit    = require('findit');
const ziplib    = require('./zip.js');

const baseurl   = config.base_url +'/';
const EMPTY     = Buffer.from([]);
const FIX_MTIME = 50; // 文件保存时间和立即读取的时间有出入
const MAX_FILE  = 10 * 1024 * 1024; // 10M
const local_fs_pool = {};


for (let i=0; i< config.local_fs.length; ++i) {
  let loc = config.local_fs[i];
  local_fs_pool[loc.fsid] = loc;
  loc.fs = localfs;
}


container.service(init_service, [
  { type: 'meta', desc: 'IDE 接口初始化' },
  { type: 'json' },
  { type: 'session', pass: config.session_pass, store: store },
  { type: 'auth' },
]);
function init_service(req, resp, next) {
  // 可以打开指定 fs
  const fsid = req.query.fsid;

  getfs(fsid, function(err, fs, name, base) {
    if (err) return sendJson(resp, err);

    resp.json({
      ret         : 0,
      msg         : 'ok',
      plugin_js   : null,
      default_fsid    : fsid,
      default_fs_name : name,

      service_url : {
        list_fs       : baseurl + 'list_fs',
        dir           : baseurl + 'dir',
        read          : baseurl + 'read',
        write         : baseurl + 'write',
        new_file      : baseurl + 'new_file',
        new_dir       : baseurl + 'new_dir',
        del_file      : baseurl + 'del_file',
        del_dir       : baseurl + 'remove_dir',
        find_in_file  : baseurl + 'find_in_file',
        move_to       : baseurl + 'move_to',
        copy_to       : baseurl + 'copy_to',
        upfile        : baseurl + 'upfile',
        zip           : baseurl + 'zip',
        unzip         : baseurl + 'unzip',
      }
    });
  });
}


container.service(list_fs, [
  { type: 'meta', desc: '列出用户磁盘(for ide)' },
  { type: 'json' },
  { type: 'session', pass: config.session_pass, store: store },
  { type: 'auth' },
  { type: 'redis' },
]);
function list_fs(req, resp, next) {
  var data = [];

  // if (req.is_admin_user) {
    for (var id in local_fs_pool) {
      data.push(local_fs_pool[id]);
    }
  // }

  // req.user_res(nfs.res_type, function(err, list) {
  //   if (err) return next(err);
  //   var i = -1;
  //   _next_drv();

  //   function _next_drv() {
  //     if (++i >= list.length) return over();
  //     var fsid = list[i];

  //     nfs.get_driver().state(fsid, function(err, st) {
  //       if (err) logger.error(err.message);
  //       if (st) {
  //         data.push({
  //           fsid : fsid,
  //           name : st.note,
  //         });
  //       }
  //       _next_drv();
  //     });
  //   }

  // });

  // function over() {
    resp.json({
      ret  : 0,
      msg  : 'ok',
      data : data,
    });
  // }
}


container.service(dir, [
  // { type: 'expense' },
  { type: 'meta', desc: '列出目录(for ide)' },
  { type: 'json' },
  { type: 'string', name: 'fsid', min: 1 },
  { type: 'string', name: 'path', min: 1 },
  { type: 'safe_path', name: 'path' },
  { type: 'session', pass: config.session_pass, store: store },
  { type: 'auth' },
]);
function dir(req, resp, next) {
  var data = [];
  var ps = 0;

  rep_process(req, resp, 0, 0, function(fs, path, fsid) {

    fs.readdir(path, function(err, files) {
      if (err) return sendJson(resp, err);

      if (files.length < 1) {
        return over();
      }

      files.forEach(function(fname) {
        ++ps;
        fs.stat(path + '/' + fname, function(err, stat) {
          if (err) {
            logger.log(err.message);
          } else {
            data.push({
              name : fname,
              type : stat.isDirectory() ? 'd' : 'f',
            });
          }
          if (--ps <= 0) over();
        });
      });
    });

    function over() {
      resp.json({
        ret : 0,
        data : data,
      });
    }

  });
}


container.service(new_dir, [
  { type: 'meta', desc: '创建目录(for ide)' },
  { type: 'json' },
  { type: 'string', name: 'fsid', min: 1 },
  { type: 'string', name: 'path', min: 1 },
  { type: 'safe_path', name: 'path' },
  { type: 'session', pass: config.session_pass, store: store },
  { type: 'auth' },
]);
function new_dir(req, resp, next) {
  rep_process(req, resp, 0, 0, function(fs, path, fsid) {

    fs.mkdir(path, function(err) {
      if (err) return sendJson(resp, err);
      resp.json({ ret : 0, msg : 'ok' });
    });

  });
}


container.service(new_file, [
  { type: 'meta', desc: '创建文件(for ide)' },
  { type: 'json' },
  { type: 'string', name: 'fsid', min: 1 },
  { type: 'string', name: 'path', min: 1 },
  { type: 'safe_path', name: 'path' },
  { type: 'session', pass: config.session_pass, store: store },
  { type: 'auth' },
]);
function new_file(req, resp) {
  rep_process(req, resp, 0, 0, function(fs, path, fsid) {

    fs.writeFile(path, EMPTY, {flag: 'wx'}, function(err) {
      if (err) return sendJson(resp, err);
      resp.json({ ret : 0, msg : 'ok' });
    });

  });
}


container.service(read, [
  { type: 'meta', desc: '读取文件(for ide)' },
  { type: 'string', name: 'fsid', min: 1 },
  { type: 'string', name: 'path', min: 1 },
  { type: 'safe_path', name: 'path' },
  { type: 'session', pass: config.session_pass, store: store },
  { type: 'auth' },
]);
function read(req, resp) {
  var uptime, stream;

  rep_process(req, resp, 0, 0, function(fs, path, fsid) {

    fs.stat(path, function(err, stat) {
      if (err) return error(err);
      uptime = stat.mtime.getTime();
      stream = fs.createReadStream(path);
      send_data();
    });

    function error(e) {
      resp.statusCode = 404;
      resp.statusMessage = e.message;
      resp.end();
    }

    function send_data() {
      var bname = encodeURIComponent( plib.basename(path) );
      resp.setHeader('Content-Type', 'application/octet-stream');
      resp.setHeader('Content-Disposition', 'attachment; filename="'+ bname +'";');
      resp.setHeader('uptime', uptime);
      stream.pipe(resp);
      stream.on('error', function(e) {
        logger.error(e);
        resp.end();
      });
    }

  });
}


container.service(write, [
  { type: 'meta', desc: '写入文件(for ide)' },
  { type: 'string', name: 'fsid', min: 1 },
  { type: 'string', name: 'path', min: 1 },
  { type: 'integer', name: 'uptime', min: 1 },
  { type: 'json' },
  { type: 'safe_path', name: 'path' },
  { type: 'session', pass: config.session_pass, store: store },
  { type: 'auth' },
]);
function write(req, resp, next) {
  rep_process(req, resp, 0, 0, function(fs, path, fsid) {

    fs.stat(path, function(err, stat) {
      if (err) return sendJson(resp, err);
      var filetime = stat.mtime.getTime();
      if (filetime > Number(req.query.uptime)) {
        return resp.json({
          ret : 7,
          msg : 'file changed',
          uptime : filetime,
        });
      }
      var stream = fs.createWriteStream(path);
      req.pipe(stream);

      stream.on('finish', function() {
        fs.stat(path, function(err, stat) {
          if (err) return sendJson(err);
          resp.json({
            ret    : 0,
            msg    : 'ok',
            uptime : stat.mtime.getTime() + FIX_MTIME,
          });
        });
      });

      stream.on('error', function(err) {
        sendJson(resp, err);
      });
    });

  });
}


container.service(remove_dir, [
  { type: 'meta', desc: '删除目录(for ide)' },
  { type: 'json' },
  { type: 'string', name: 'fsid', min: 1 },
  { type: 'string', name: 'path', min: 1 },
  { type: 'safe_path', name: 'path' },
  { type: 'session', pass: config.session_pass, store: store },
  { type: 'auth' },
]);
function remove_dir(req, resp) {
  var recursive = req.query.recursive == 'true';
  rep_process(req, resp, 0, 0, function(fs, path, fsid) {

    fs.stat(path, function(err, stat) {
      if (err) return sendJson(resp, err);
      if (!stat.isDirectory()) {
        return resp.json({
          ret    : 2,
          msg    : 'is not directory: ' + path,
        });
      }

      if (recursive) {
        rmdir_recursive();
      } else {
        fs.rmdir(path, function(err) {
          sendJson(resp, err);
        });
      }
    });

    function rmdir_recursive() {
      var finder = findit(path, { fs: fs });
      var dirs = [], i = -1;
      var wait = 1;

      finder.on('error', function(err) {
        finder.stop();
        sendJson(resp, err);
      });

      finder.on('directory', function (dir, stat, stop) {
        dirs.push(dir);
      });

      finder.on('file', unlink);
      finder.on('link', unlink);
      finder.on('end', function() {
        dirs.sort(function(a, b) {
          return b.length - a.length;
        });
        if (--wait <= 0) rmdir();
      });

      function unlink(file, stat) {
        ++wait;
        fs.unlink(file, function(err) {
          if (err) finder.emit('error', err);
          if (--wait <= 0) rmdir();
        });
      }

      function rmdir() {
        if (++i < dirs.length) {
          fs.rmdir(dirs[i], function(err) {
            if (err) return sendJson(resp, err);
            rmdir();
          });
        } else {
          sendJson(resp);
        }
      }
    }

  });
}


container.service(del_file, [
  { type: 'meta', desc: '删除文件(for ide)' },
  { type: 'json' },
  { type: 'string', name: 'fsid', min: 1 },
  { type: 'string', name: 'path', min: 1 },
  { type: 'safe_path', name: 'path' },
  { type: 'session', pass: config.session_pass, store: store },
  { type: 'auth' },
]);
function del_file(req, resp) {
  if (req.query.path == '' || req.query.path == '/') {
    return resp.json({
      ret    : 12,
      msg    : 'cannot remove root',
    });
  }

  rep_process(req, resp, 0, 0, function(fs, path, fsid) {

    fs.stat(path, function(err, stat) {
      if (err) return sendJson(resp, err);
      if (stat.isDirectory()) {
        return resp.json({
          ret    : 2,
          msg    : 'is not file: ' + path,
        });
      }
      fs.unlink(path, function(err) {
        sendJson(resp, err);
      });
    });

  });
}


container.service(find_in_file, [
  { type: 'meta', desc: '在指定目录搜索文件内容(for ide)' },
  { type: 'expense' },
  { type: 'json' },
  { type: 'string', name: 'fsid', min: 1 },
  { type: 'string', name: 'path', min: 1 },
  { type: 'string', name: 'find', min: 3, max: 80 },
  { type: 'safe_path', name: 'path' },
  { type: 'session', pass: config.session_pass, store: store },
  { type: 'auth' },
]);
function find_in_file(req, resp) {
  rep_process(req, resp, 0, 0, function(fs, path, fsid, base) {

    var SHOW_TXT_LEN = 15;
    var count  = 0;
    var finded = [], skip = [];
    var ftxt   = req.query.find;
    var finder = findit(path, { fs: fs });
    var blen   = base.length;

    if (base == '/' || base == '\\') blen = 0;

    finder.on('error', function(err) {
      finder.stop();
      sendJson(resp, err);
    });

    finder.on('file', read_file);
    finder.on('link', read_file);
    // finder.on('end', function() {});

    function read_file(file, stat) {
      if (stat.size > MAX_FILE) {
        skip.push([file, "File too large " + (stat.size/1024) + 'KB']);
        return;
      }
      ++count;

      fs.readFile(file, 'utf8', function findinfile(err, data) {
        --count;
        file = file.substr(blen);
        if (err) {
          skip.push([file, err.message]);
        } else {
          var i = 0;
          // 找到所有符合查询字串在文件中的字节索引
          var _index = [];
          for (;;) {
            i = data.indexOf(ftxt, i);
            if (i >= 0) {
              _index.push(i);
              ++i;
            } else {
              break;
            }
          }
          // 把索引转换为文件行
          if (_index.length > 0) {
            var searchlc = {};
            var lc = 0, st = 0;
            var lclen = SHOW_TXT_LEN+ SHOW_TXT_LEN+ ftxt.length;

            for (var i=0, e=_index.length; i<e; ++i) {
              var end = _index[i];
              while (st < end) {
                if (data[st] == '\n') lc++;
                ++st;
              }
              searchlc[lc] = data.substr(end-SHOW_TXT_LEN, lclen);
            }
            finded.push([file, searchlc]);
          }
        }

        if (count <= 0) {
          resp.json({
            ret    : 0,
            msg    : 'ok',
            data   : finded,
            skip   : skip,
          });
        }
      });
    }

  });
}


container.service(move_to, [
  { type: 'meta', desc: '移动目录/文件(for ide)' },
  { type: 'json' },
  { type: 'string', name: 'fsid', min: 1 },
  { type: 'string', name: 'path', min: 1 },
  { type: 'string', name: 'to', min: 1 },
  { type: 'safe_path', name: 'path' },
  { type: 'safe_path', name: 'to' },
  { type: 'session', pass: config.session_pass, store: store },
  { type: 'auth' },
]);
function move_to(req, resp) {
  rep_process(req, resp, 0, 0, function(fs, path, fsid, base) {
    var to = plib.join(base, req.query.to);

    fs.exists(to, function(exists) {
      if (exists) return resp.json({
        ret : 6, msg : 'target file ' + to + ' exists' });

      fs.rename(path, to, function(err) {
        sendJson(resp, err);
      });
    });
  });
}


container.service(copy_to, [
  { type: 'meta', desc: '复制目录/文件(for ide)' },
  { type: 'json' },
  { type: 'string', name: 'sfsid', min: 1 },
  { type: 'string', name: 'spath', min: 1 },
  { type: 'string', name: 'tfsid', min: 1 },
  { type: 'string', name: 'tpath', min: 1 },
  { type: 'safe_path', name: 'spath' },
  { type: 'safe_path', name: 'tpath' },
  { type: 'session', pass: config.session_pass, store: store },
  { type: 'auth' },
]);
function copy_to(req, resp) {
  var errs   = [];
  var wait   = 1;

  rep_process(req, resp, 'spath', 'sfsid', function(sfs, spath, sfsid) {
  rep_process(req, resp, 'tpath', 'tfsid', function(tfs, tpath, tfsid) {

    var finder = findit(spath, { fs: sfs });
    var files = [], dirs = [], i = -1;

    finder.on('error', function(err) {
      errs.push(err.message);
    });

    finder.on('file', _file);
    finder.on('link', _file);
    finder.on('directory', _directory);
    finder.on('end', function() { i=-1; _create_dir(); });

    function _directory(dir, stat, stop) {
      dirs.push(dir);
    }

    function _file(file, stat) {
      files.push({ f: file, s: stat });
    }

    function _create_dir() {
      if (++i >= dirs.length) {
        i = -1;
        return _copy_file();
      }

      var tdir = plib.join(tpath, dirs[i].substr(spath.length));
      tfs.mkdir(tdir, function(err) {
        if (err) errs.push(err.message);
        _create_dir();
      });
    }

    function _copy_file() {
      if (++i >= files.length) {
        resp.json({ ret : 0, msg : 'copy over', err: errs });
        return;
      }

      var file  = files[i].f;
      var tfile = plib.join(tpath, file.substr(spath.length));
      var write = tfs.createWriteStream(tfile, { flags : 'wx' });
      var read  = sfs.createReadStream(file);
      var isend = false;

      read.pipe(write);
      read.on('error', _end);
      write.on('error', _end);
      read.on('close', _end);
      write.on('close', _end);

      function _end(err) {
        if (err) {
          errs.push(err.message);
        }
        if (!isend) {
          write.end();
          isend = true;
          _copy_file();
        }
      }
    }

  });});
}


container.service(upfile, [
  { type: 'meta', desc: '上传文件, 支持大文件(for ide)' },
  { type: 'json' },
  { type: 'string', name: 'fsid', min: 1 },
  { type: 'string', name: 'path', min: 1 },
  { type: 'safe_path', name: 'path' },
  { type: 'session', pass: config.session_pass, store: store },
  { type: 'auth' },
]);
function upfile(req, resp) {
  rep_process(req, resp, 0, 0, function(fs, path, fsid, base) {

    var write = fs.createWriteStream(path, { flags : 'wx' });

    write.on('error', _close);
    write.on('close', _close);
    req.on('error', _close);
    req.pipe(write);

    function _close(err) {
      write.end();
      if (err) return sendJson(resp, err);
      resp.json({ ret : 0, msg : 'ok' });
    }

  });
}


container.service(zip, [
  { type: 'meta', desc: '压缩目录/文件到 zip (for ide)' },
  { type: 'json' },
  { type: 'string', name: 'fsid', min: 1 },
  { type: 'string', name: 'zfsid', min: 1 },
  { type: 'string', name: 'path', min: 1 },
  { type: 'string', name: 'zip',  min: 1 },
  { type: 'safe_path', name: 'path' },
  { type: 'safe_path', name: 'zip' },
  { type: 'session', pass: config.session_pass, store: store },
  { type: 'auth' },
]);
function zip(req, resp) {
  rep_process(req, resp, 0, 0, function(fs, path, fsid, base) {
  rep_process(req, resp, 'zip', 'zfsid', function(zfs, zpath, zfsid, zbase) {

    ziplib.zip(fs, path, zfs, zpath, function(err) {
      sendJson(resp, err);
    });

  });});
}


container.service(unzip, [
  { type: 'meta', desc: '解压缩 zip 文件(for ide)' },
  { type: 'json' },
  { type: 'string', name: 'fsid', min: 1 },
  { type: 'string', name: 'path', min: 1 },
  { type: 'string', name: 'zip',  min: 1 },
  { type: 'string', name: 'zfsid', min: 1 },
  { type: 'safe_path', name: 'path' },
  { type: 'safe_path', name: 'zip' },
  { type: 'session', pass: config.session_pass, store: store },
  { type: 'auth' },
]);
function unzip(req, resp) {
  rep_process(req, resp, 0, 0, function(fs, path, fsid) {
  rep_process(req, resp, 'zip', 'zfsid', function(zfs, zpath, zfsid) {

    zfs.stat(zpath, function(err, stat) {
      if (err) return sendJson(resp, err);

      if (stat.size > MAX_FILE) {
        return resp.json({
          ret : 15,
          msg : "file is too large " + (stat.size/1024) + 'KB',
        });
      }

      ziplib.unzip(zfs, zpath, fs, path, function(err) {
        sendJson(resp, err);
      });
    });

  }); });
}


// -- | Tools | ----------------------------------------------------------------

//
// 如果出错直接返回给客户端
//
// path_attr -- 可以空, 路径属性在 req.query 中的名称
// id_attr   -- 可以空, fsid 属性在 req.query 中的名称
// cb        -- Function(fs, path, fsid, base)
//
function rep_process(req, resp, path_attr, id_attr, cb) {
  var fsid  = req.query[id_attr || 'fsid'];

  // if (req.is_admin_user) {
  //   __get_fs();
  // } else {
  //   resp.check_auth(fsid, nfs.res_type, __get_fs);
  // }

  // function __get_fs() {
    getfs(fsid, function(err, fs, name, base) {
      if (!fs) return resp.json({ ret : 8, msg : 'invalid fsid: ' + fsid });
      var path = plib.join(base, req.query[path_attr || 'path']);

      cb(fs, path, fsid, base);
    });
  // }
}


function getfs(fsid, cb) {
  var _fs = local_fs_pool[fsid];
  if (_fs) {
    return cb(null, _fs.fs, _fs.name, _fs.base);
  } else {
    return cb(new Error("cannot found fs: "+ fsid));
  }
  // nfs.get_hd(fsid, function(err, fs) {
  //   if (err) return cb(err);
  //   cb(null, fs, fs.note, '/');
  // });
}


function sendJson(resp, err, data) {
  resp.setHeader('content-type', 'application/json; charset=utf-8');
  var json;
  if (err) {
    json = { msg: err.message, data: data };
    //
    // 将 fs 抛出的异常转换错误代码
    //
    switch (err.code) {
      case 'ENOTEMPTY':
        json.ret = 13; break;
      case 'EEXIST':
        json.ret = 6; break;
      case 'EPERM':
        json.ret = 12; break;
      default:
        json.ret = 1; break;
    }

  } else if (data) {
    json = data;
  } else {
    json = { ret : 0, msg : 'ok', };
  }

  try {
    json = JSON.stringify(json);
  } catch(e) {
    json = JSON.stringify({ ret: 1, msg: e.message, stack: e.stack });
  }
  resp.end(json);
}


}
