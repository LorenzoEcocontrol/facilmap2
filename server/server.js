#!/usr/bin/env node

const debug = require("debug");
const fs = require("fs");
const path = require("path");
const Sequelize = require("sequelize");
const Promise = require("bluebird");
const request = require("request-promise");
const requestDebug = require("request-debug");


const configPath = path.resolve(process.argv[2] || `${__dirname}/../config.js`);

if(!fs.existsSync(configPath)) {
	console.error(`Usage: ${process.argv[0]} ${process.argv[1]} <config.js>`);
	process.exit(1);
}

const config = require(configPath);

process.env.fmUserAgent = config.userAgent;


if(debug.enabled("request")) {
	requestDebug(request);
}


var Database = require("./database/database");
var utils = require("./utils");
var Socket = require("./socket");
var webserver = require("./webserver");

Object.defineProperty(Error.prototype, "toJSON", {
	value: function() {
		var str = this.message;
		if(this.errors) {
			for(var i=0; i<this.errors.length; i++)
				str += "\n"+this.errors[i].message;
		}

		return str;
	},
	configurable: true
});

process.on('unhandledRejection', (reason, promise) => {
	console.trace("Unhandled rejection", reason);
});


let bluebirdConfig = {
	longStackTraces: true
};
Promise.config(bluebirdConfig)
Sequelize.Promise.config(bluebirdConfig);


const database = new Database(config.db);

utils.promiseAuto({
	databaseConnect: database.connect(),

	server: (databaseConnect) => {
		return webserver.init(database, config.port, config.host);
	},

	socket: (server) => {
		return new Socket(server, database);
	}
}).then(res => {
	console.log("Server started on " + (config.host || "*" ) + ":" + config.port);
}).catch(err => {
	console.error(err);
	process.exit(1);
});