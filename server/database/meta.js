var Sequelize = require("sequelize");

var utils = require("../utils");

module.exports = function(Database) {
	Database.prototype._init.push(function() {
		let Meta = this._conn.define("Meta", {
			key: { type: Sequelize.STRING, allowNull: false, primaryKey: true },
			value: { type: Sequelize.TEXT, allowNull: false }
		});
	});

	// =====================================================================================================================

	utils.extend(Database.prototype, {
		getMeta(key) {
			return this._conn.model("Meta").findOne({where: {key}});
		},

		setMeta(key, value) {
			return this._conn.model("Meta").upsert({key, value});
		}

	});
};