var Promise = require("bluebird");
var Sequelize = require("sequelize");

var utils = require("../utils");

const Op = Sequelize.Op;

module.exports = function(Database) {
	Database.prototype._init.push(function() {
		this._conn.define("Pad", {
			id : { type: Sequelize.STRING, allowNull: false, primaryKey: true, validate: { is: /^.+$/ } },
			name: { type: Sequelize.TEXT, allowNull: true, get: function() { return this.getDataValue("name") || "New FacilMap"; } },
			writeId: { type: Sequelize.STRING, allowNull: false, validate: { is: /^.+$/ } },
			adminId: { type: Sequelize.STRING, allowNull: false, validate: { is: /^.+$/ } },
			searchEngines: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
			description: { type: Sequelize.STRING, allowNull: false, defaultValue: "" },
			clusterMarkers: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
			legend1: { type: Sequelize.STRING, allowNull: false, defaultValue: "" },
			legend2: { type: Sequelize.STRING, allowNull: false, defaultValue: "" }
		});
	});

	Database.prototype._afterInit.push(function() {
		this._conn.model("Pad").belongsTo(this._conn.model("View"), { as: "defaultView", foreignKey: "defaultViewId", constraints: false });
	});

	// =====================================================================================================================

	utils.extend(Database.prototype, {
		padIdExists(padId) {
			return this._conn.model("Pad").count({ where: { [Op.or]: [ { id: padId }, { writeId: padId }, { adminId: padId } ] } }).then(function(num) {
				return num > 0;
			});
		},

		getPadData(padId) {
			return this._conn.model("Pad").findOne({ where: { id: padId }, include: [ { model: this._conn.model("View"), as: "defaultView" } ]});
		},

		getPadDataByWriteId(writeId) {
			return this._conn.model("Pad").findOne({ where: { writeId: writeId }, include: [ { model: this._conn.model("View"), as: "defaultView" } ] });
		},

		getPadDataByAdminId(adminId) {
			return this._conn.model("Pad").findOne({ where: { adminId: adminId }, include: [ { model: this._conn.model("View"), as: "defaultView" } ] });
		},

		getPadDataByAnyId(padId) {
			return this._conn.model("Pad").findOne({ where: { [Op.or]: { id: padId, writeId: padId, adminId: padId } }, include: [ { model: this._conn.model("View"), as: "defaultView" } ] });
		},

		createPad(data) {
			return utils.promiseAuto({
				validate: () => {
					if(!data.id || data.id.length == 0)
						throw new Error("Invalid read-only ID");
					if(!data.writeId || data.writeId.length == 0)
						throw new Error("Invalid read-write ID");
					if(!data.adminId || data.adminId.length == 0)
						throw new Error("Invalid admin ID");
					if(data.id == data.writeId || data.id == data.adminId || data.writeId == data.adminId)
						throw new Error("Read-only, read-write and admin ID have to be different from each other.");

					return Promise.all([
						this.padIdExists(data.id).then((exists) => {
							if(exists)
								throw new Error("ID '" + data.id + "' is already taken.");
						}),
						this.padIdExists(data.writeId).then((exists) => {
							if(exists)
								throw new Error("ID '" + data.writeId + "' is already taken.");
						}),
						this.padIdExists(data.adminId).then((exists) => {
							if(exists)
								throw new Error("ID '" + data.adminId + "' is already taken.");
						})
					]);
				},

				create: (validate) => {
					return this._conn.model("Pad").create(data);
				},

				types: (create) => {
					return Promise.all(this.DEFAULT_TYPES.map((it) => {
						return this.createType(data.id, it);
					}));
				}
			}).then(res => {
				return res.create;
			});
		},

		updatePadData(padId, data) {
			return utils.promiseAuto({
				oldData: this.getPadData(padId),

				validateRead: () => {
					if(data.id != null && data.id != padId && data.id.length == 0)
						throw new Error("Invalid read-only ID");

					var existsPromises = [ ];

					if(data.id != null && data.id != padId) {
						return this.padIdExists(data.id).then((exists) => {
							if(exists)
								throw new Error("ID '" + data.id + "' is already taken.");
						});
					}
				},

				validateWrite: (oldData) => {
					if(data.writeId != null && data.writeId != oldData.writeId) {
						if(data.writeId.length == 0)
							throw new Error("Invalid read-write ID");
						if(data.writeId == (data.id != null ? data.id : padId))
							throw new Error("Read-only and read-write ID cannot be the same.");

						return this.padIdExists(data.writeId).then((exists) => {
							if(exists)
								throw new Error("ID '" + data.writeId + "' is already taken.");
						});
					}
				},

				validateAdmin: (oldData) => {
					if(data.adminId != null && data.adminId != oldData.adminId) {
						if(data.adminId.length == 0)
							throw new Error("Invalid admin ID");
						if(data.adminId == (data.id != null ? data.id : padId))
							throw new Error("Read-only and admin ID cannot be the same.");
						if(data.adminId == (data.writeId != null ? data.writeId : oldData.writeId))
							throw new Error("Read-write and admin ID cannot be the same.");

						return this.padIdExists(data.adminId).then((exists) => {
							if(exists)
								throw new Error("ID '" + data.adminId + "' is already taken.");
						});
					}
				},

				update: (oldData, validateRead, validateWrite, validateAdmin) => {
					if(!oldData)
						throw new Error("Pad " + padId + " could not be found.");

					return this._conn.model("Pad").update(data, { where: { id: padId } });
				},

				newData: (update) => this.getPadData(data.id || padId),

				history: (oldData, newData) => {
					return this.addHistoryEntry(data.id || padId, {
						type: "Pad",
						action: "update",
						objectBefore: oldData,
						objectAfter: newData
					});
				}
			}).then((res) => {
				this.emit("padData", padId, res.newData);

				return res.newData;
			});
		},

		async deletePad(padId) {
			const padData = await this.getPadDataByAnyId(padId);

			if (padData.defaultViewId) {
				await this.updatePadData(padData.id, { defaultViewId: null });
			}

			await utils.streamEachPromise(this.getPadMarkers(padData.id, null), async (marker) => {
				await this.deleteMarker(padData.id, marker.id);
			});

			await utils.streamEachPromise(this.getPadLines(padData.id, ['id']), async (line) => {
				await this.deleteLine(padData.id, line.id);
			});

			await utils.streamEachPromise(this.getTypes(padData.id), async (type) => {
				await this.deleteType(padData.id, type.id);
			});

			await utils.streamEachPromise(this.getViews(padData.id), async (view) => {
				await this.deleteView(padData.id, view.id);
			});

			await this.clearHistory(padData.id);

			await this._conn.model("Pad").destroy({ where: { id: padData.id } });

			this.emit("deletePad", padId);
		}

		/*function copyPad(fromPadId, toPadId, callback) {
			function _handleStream(stream, next, cb) {
				stream.on("data", function(data) {
					stream.pause();
					cb(data, function() {
						stream.resume();
					});
				});

				stream.on("error", next);
				stream.on("end", next);
			}

			async.auto({
				fromPadData : function(next) {
					backend.getPadData(fromPadId, next);
				},
				toPadData : function(next) {
					getPadData(toPadId, next);
				},
				padsExist : [ "fromPadData", "toPadData", function(r, next) {
					if(!r.fromPadData)
						return next(new Error("Pad "+fromPadId+" does not exist."));
					if(!r.toPadData.writable)
						return next(new Error("Destination pad is read-only."));

					toPadId = r.toPadData.id;

					next();
				}],
				copyMarkers : [ "padsExist", function(r, next) {
					_handleStream(getPadMarkers(fromPadId, null), next, function(marker, cb) {
						createMarker(toPadId, marker, cb);
					});
				}],
				copyLines : [ "padsExist", function(r, next) {
					_handleStream(getPadLines(fromPadId), next, function(line, cb) {
						async.auto({
							createLine : function(next) {
								_createLine(toPadId, line, next);
							},
							getLinePoints : function(next) {
								backend.getLinePoints(line.id, next);
							},
							setLinePoints : [ "createLine", "getLinePoints", function(r, next) {
								_setLinePoints(toPadId, r.createLine.id, r.getLinePoints, next);
							} ]
						}, cb);
					});
				}],
				copyViews : [ "padsExist", function(r, next) {
					_handleStream(getViews(fromPadId), next, function(view, cb) {
						createView(toPadId, view, function(err, newView) {
							if(err)
								return cb(err);

							if(r.fromPadData.defaultView && r.fromPadData.defaultView.id == view.id && r.toPadData.defaultView == null)
								updatePadData(toPadId, { defaultView: newView.id }, cb);
							else
								cb();
						});
					});
				}]
			}, callback);
		}*/
	});
};