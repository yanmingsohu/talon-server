var Jszip  = require('jszip');
var plib   = require('path');


module.exports = {
  zip   : zip,
  unzip : unzip,
};

//
// 出错即终止
//
function zip(sfs, spath, dfs, dpath, next) {
  var base = plib.dirname(spath);
  var name = plib.basename(spath);
  var zip  = new Jszip();

  dfs.exists(dpath, function(exist) {
    if (exist) return next(new Error('fail: dest file is exist: ' + dpath));
    begin();
  });

  function begin() {
    walkdir(sfs, base, name, function(err, list) {
      if (err) return next(err);
      var i = -1;
      each();

      function each() {
        if (++i < list.length) {
          var f = list[i];

          if (f.type == 'file') {
            var read = sfs.createReadStream(f.complete);
            read.on('end', each);
            read.on('error', next);
            zip.file(f.name, read);
            sfs.readFile(f.complete, function(err, buf) {
              if (err) return next(err);
              zip.file(f.name, buf);
              // console.log('file\t', f.name, '\t', buf.length, 'bytes');
              each();
            });
          }
          else if (f.type == 'dir') {
            zip.folder(f.name);
            // console.log('dir\t', f.name);
            each();
          }
          else {
            // console.log('UNKNOW type', f.type, f.name);
            each();
          }
        } else {
          writezip();
        }
      }
    });
  }

  function writezip() {
    zip
    .generateNodeStream({
      type : 'nodebuffer',
      streamFiles : true,
      compression : 'DEFLATE',
      compressionOptions : {level:3},
    })
    .pipe(dfs.createWriteStream(dpath))
    .on('finish', function () {
        // console.log("out.zip written.");
        next();
    })
    .on('error', next);
  }
};


//
// 只要出错就终止
//
function unzip(sfs, spath, dfs, dpath, next) {

  sfs.readFile(spath, function(err, buffer) {
    if (err) return next(err);
    var ens = [], i = -1;
    var zip = new Jszip();
    zip.loadAsync(buffer).then(bufferLoaded);

    function bufferLoaded(obj) {
      for (var n in obj.files) {
        ens.push(obj.files[n]);
      }
      eachEnt();
    }

    function eachEnt() {
      if (++i < ens.length) {
        var ent = ens[i];
        var fname = plib.join(dpath, ent.name);

        if (ent.dir) {
          dfs.mkdir(fname, function(err) {
            if (err) return next(err);
            // console.log('dir\t', fname);
            eachEnt();
          });
        }
        else {
          ent.nodeStream()
             .pipe(dfs.createWriteStream(fname, { flags: 'wx' }))
             .on('finish', eachEnt)
             .on('error', next);
        }
      } else {
        next();
      }
    }
  });
};


//
// 遍历 _rdir/_name 并从 _name 开始, 每个文件/目录
// 回调 cb , 返回的路径都是基于 _dir 的相对路径.
// cb : Function(err, infos)
//  infos : [ { name: 相对于_rdir的路径, type: 'file/dir',
//   complete: 文件的完整路径, size: 如果是文件则设置为文件长度 } ]
//
function walkdir(_fs, _rdir, _name, cb) {
  // dirs 是相对于 _rdis 的目录
  var dirs = [];
  var rets = [];
  type(_rdir, _name, function(err) {
    if (err) return cb(err);
    cb(null, rets);
  });

  function type(dir, name, over) {
    var compf = plib.join(dir, name);
    var abs = dirs.join('/');
    _fs.stat(compf, function(err, st) {
      if (err) return over(err);
      if (st.isDirectory()) {
        dirs.push(name);
        rets.push({
          name : plib.join(abs, name),
          type : 'dir',
          size : st.size,
          complete : compf,
        });
        eachdir(compf, over);
      } else {
        rets.push({
          name : plib.join(abs, name),
          type : 'file',
          complete : compf,
        });
        over();
      }
    });
  }

  function eachdir(dirname, over) {
    _fs.readdir(dirname, function(err, list) {
      if (err) return over(err);
      var i = -1;
      eachfile();
      function eachfile() {
        if (++i < list.length) {
          type(dirname, list[i], eachfile);
        } else {
          dirs.pop();
          over();
        }
      }
    });
  }
}
