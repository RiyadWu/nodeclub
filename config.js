/**
 * config
 */

exports.config = {
	name: 'Node Club',
	description: 'Node Club 是用Node.js开发的社区软件',
	host: 'http://127.0.0.1/',
	db: 'mongodb://127.0.0.1/node_club',
	session_secret: 'node_club',
	auth_cookie_name: 'node_club',
	port: 8000,
	version: '0.0.1',

	// topics list count
	list_topic_count: 20,

	// mail SMTP
	mail_port: 25,
	mail_user: 'cheewu@126.com',
	mail_pass: '159357wq',
	mail_host: 'smtp.126.com',
	mail_sender: 'cheewu <cheewu@126.com>',
	mail_use_authentication: true,

	//weibo app key
	weibo_key: 10000000,

	// admins
	admins: {admin:true}
};
