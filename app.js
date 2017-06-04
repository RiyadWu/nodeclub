/*!
 * nodeclub - app.js
 */

/**
 * Module dependencies.
 */

var config = require('./config');

if (!config.debug && config.oneapm_key) {
  require('oneapm'); // 线上应用监控
}

require('colors'); // node console 彩色显示
var path = require('path');
var Loader = require('loader'); // 生产模式中压缩所有的静态资源实现加速
var LoaderConnect = require('loader-connect') // 编译less文件
var express = require('express');
var session = require('express-session'); // 直接从req何res中读取session信息 ？？？
var passport = require('passport'); // 权限验证中间件，可用来做单点登录
require('./middlewares/mongoose_log'); // 打印 mongodb 查询日志
require('./models'); // 数据库对象模型
var GitHubStrategy = require('passport-github').Strategy; // github 验证模块
var githubStrategyMiddleware = require('./middlewares/github_strategy'); // github验证模块
var webRouter = require('./web_router'); // 网页版逻辑
var apiRouterV1 = require('./api_router_v1'); // api逻辑
var auth = require('./middlewares/auth'); // 权限验证，登录状态验证，session生成
var errorPageMiddleware = require('./middlewares/error_page'); // 错误页
var proxyMiddleware = require('./middlewares/proxy'); // 数据库操作逻辑
var RedisStore = require('connect-redis')(session); // session缓存到redis中的中间件
var _ = require('lodash'); // lodash 库
var csurf = require('csurf'); // csrf
var compress = require('compression'); // gzip,deflate 压缩
var bodyParser = require('body-parser'); // 将http请求转成js对象
var busboy = require('connect-busboy'); // 将muti类型的http请求转成js对象
var errorhandler = require('errorhandler'); // 错误处理助手，会打印全部的错误堆栈，只建议在开发模式中用
var cors = require('cors'); // cors请求，可解决跨域请求
var requestLog = require('./middlewares/request_log'); // 打印请求日志
var renderMiddleware = require('./middlewares/render'); // 渲染页面
var logger = require('./common/logger'); // 日志
var helmet = require('helmet'); // 设置http请求的web头，防止一些广为人知的wed攻击
var bytes = require('bytes') // 字节专用单位转换 eg：bytes(1024) -> '1kB'; bytes(1000) -> '1000B'



// 静态文件目录
var staticDir = path.join(__dirname, 'public');
// assets
var assets = {};

if (config.mini_assets) {
  try {
    assets = require('./assets.json');
  } catch (e) {
    logger.error('You must execute `make build` before start app when mini_assets is true.');
    throw e;
  }
}

var urlinfo = require('url').parse(config.host); // url 库
config.hostname = urlinfo.hostname || config.host;

var app = express();

// configuration in all env
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'html');
app.engine('html', require('ejs-mate')); // ejs模板引擎
app.locals._layoutFile = 'layout.html';
app.enable('trust proxy');

// Request logger。请求时间
app.use(requestLog);

if (config.debug) {
  // 渲染时间
  app.use(renderMiddleware.render); // 重写res的render方法，在日志中打印渲染时间
}

// 静态资源
if (config.debug) {
  app.use(LoaderConnect.less(__dirname)); // 测试环境用，编译 .less on the fly
}
app.use('/public', express.static(staticDir));
app.use('/agent', proxyMiddleware.proxy);

// 通用的中间件
app.use(require('response-time')()); // 记录响应时间，响应时间：请求进入此中间件 到 浏览器接收到响应头
app.use(helmet.frameguard('sameorigin'));
app.use(bodyParser.json({limit: '1mb'}));
app.use(bodyParser.urlencoded({ extended: true, limit: '1mb' }));
app.use(require('method-override')()); // 使不兼容http动词 put/delete等的浏览器可以使用这些动词，必须在csurf之前用
app.use(require('cookie-parser')(config.session_secret)); // 将cookie解析成js对象
app.use(compress());
app.use(session({
  secret: config.session_secret,
  store: new RedisStore({
    port: config.redis_port,
    host: config.redis_host,
    db: config.redis_db,
    pass: config.redis_password,
  }),
  resave: false,
  saveUninitialized: false,
}));

// oauth 中间件
app.use(passport.initialize());

// github oauth
passport.serializeUser(function (user, done) {
  done(null, user);
});
passport.deserializeUser(function (user, done) {
  done(null, user);
});
passport.use(new GitHubStrategy(config.GITHUB_OAUTH, githubStrategyMiddleware));

// custom middleware
app.use(auth.authUser);
app.use(auth.blockUser());

if (!config.debug) {
  app.use(function (req, res, next) {
    if (req.path === '/api' || req.path.indexOf('/api') === -1) {
      csurf()(req, res, next);
      return;
    }
    next();
  });
  app.set('view cache', true);
}

// for debug
// app.get('/err', function (req, res, next) {
//   next(new Error('haha'))
// });

// set static, dynamic helpers
_.extend(app.locals, {
  config: config,
  Loader: Loader,
  assets: assets
});

app.use(errorPageMiddleware.errorPage);
_.extend(app.locals, require('./common/render_helper'));
app.use(function (req, res, next) {
  res.locals.csrf = req.csrfToken ? req.csrfToken() : '';
  next();
});

app.use(busboy({
  limits: {
    fileSize: bytes(config.file_limit)
  }
}));

// 不允许直接访问此程序，需要藏在 nginx 之后  (???不懂什么意思)
app.use(function (req, res, next) {
  if (req.connection.remoteAddress == '::ffff:127.0.0.1' || req.connection.remoteAddress == '::1') {
    return next();
  }

  res.redirect(301, 'https://cnodejs.org' + req.originalUrl)
})

// routes
app.use('/api/v1', cors(), apiRouterV1);
app.use('/', webRouter);

// error handler
if (config.debug) {
  app.use(errorhandler());
} else {
  app.use(function (err, req, res, next) {
    logger.error(err);
    return res.status(500).send('500 status');
  });
}

if (!module.parent) {
  app.listen(config.port, function () {
    logger.info('NodeClub listening on port', config.port);
    logger.info('God bless love....');
    logger.info('You can debug your app with http://' + config.hostname + ':' + config.port);
    logger.info('');
  });
}

module.exports = app;
