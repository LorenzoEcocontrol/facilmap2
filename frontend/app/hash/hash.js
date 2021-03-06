import L from 'leaflet';
import 'leaflet-hash';
import fm from '../app';

fm.app.directive("fmHash", function($rootScope, fmUtils, $q) {
	return {
		restrict: "A",
		require: "facilmap",
		link: function($scope, element, attrs, map) {
			let loadInitialViewBkp = map.loadInitialView.bind(map);
			map.loadInitialView = function() {
				map.loadInitialView = loadInitialViewBkp;
				return (hasLocationHash() ? $q.resolve() : loadInitialViewBkp(...arguments)).then((res) => {
					init();
					return res;
				});
			};

			let hasLocationHash = () => {
				return !!parseHash(location.hash, true);
			};

			let init = () => {
				var hashControl = new L.Hash(map.map);

				hashControl.parseHash = parseHash.fmWrapApply($rootScope);
				hashControl.formatHash = formatHash;

				// hashControl calls hashControl.onHashChange(), which will run hashControl.update() with 100ms delay.
				// In the meantime, we will already set the map view, which triggers hashControl.onMapMove and replace
				// the location hash. So we have to call hashControl.update() right now.
				hashControl.update();
				clearTimeout(hashControl.changeTimeout);
				hashControl.changeTimeout = null;

				map.map.on("layeradd", hashControl.onMapMove, hashControl);
				map.map.on("layerremove", hashControl.onMapMove, hashControl);
				map.mapEvents.$on("searchchange", () => {
					setTimeout(() => {
						hashControl.onMapMove();
					}, 0);
				});
				map.client.on("filter", hashControl.onMapMove.bind(hashControl));
			};

			let parseHash = (hash, noApply) => {
				if(hash.indexOf('#') === 0) {
					hash = hash.substr(1);
				}

				if(!noApply) {
					let viewMatch = hash.match(/^q=v(\d+)$/i);
					if(viewMatch) {
						if(map.client.views[viewMatch[1]]) {
							map.displayView(map.client.views[viewMatch[1]]);
							return;
						}
					}
				}

				var args;
				if(hash.indexOf("=") != -1 && hash.indexOf("/") == -1)
					args = oldToNew(hash);
				else
					args = hash.split("/").map(decodeURIComponentTolerantly);

				var ret = L.Hash.parseHash(args.slice(0, 3).join("/"));

				if(!noApply) {
					// This gets called just in L.Hash.update(), so we can already add/remove the layers here

					var l = args[3] && args[3].split("-");
					if(l && l.length > 0) {
						for(var i in map.layers) {
							if(l.indexOf(i) == -1) {
								if(map.map.hasLayer(map.layers[i]))
									map.map.removeLayer(map.layers[i]);
							} else if(!map.map.hasLayer(map.layers[i]))
								map.map.addLayer(map.layers[i]);
						}
					}

					let e = map.mapEvents.$broadcast("showObject", args[4] || "", !ret);
					if(!e.defaultPrevented && map.searchUi)
						map.searchUi.search(args[4] || "", !!ret, args[4] ? (ret && !fmUtils.isSearchId(args[4])) : null);

					map.client.setFilter(args[5] || "");
				}

				return ret;
			};

			let formatHash = (mapObj) => {
				var ret = L.Hash.formatHash(mapObj);

				var l = [ ];
				for(var i in map.layers) {
					if(mapObj.hasLayer(map.layers[i]))
						l.push(i);
				}

				var additionalParts = [ l.join("-") ];
				let isZoomedToHash = false;

				if(map.infoBox.currentId) {
					additionalParts.push(map.infoBox.currentId);
					isZoomedToHash = map.infoBox.isCurrentObjectZoomed();
				} else if(map.searchUi && map.searchUi.getSubmittedSearch()) {
					additionalParts.push(map.searchUi.getSubmittedSearch());
					isZoomedToHash = map.searchUi.isZoomedToSubmittedSearch();
				} else if(map.client.filterExpr)
					additionalParts.push("");

				if(map.client.filterExpr)
					additionalParts.push(map.client.filterExpr);

				if(isZoomedToHash && additionalParts.length == 2 && additionalParts[0] == Object.keys(map.layers)[0])
					ret = "#q=" + encodeURIComponent(additionalParts[1]);
				else
					ret += "/" + additionalParts.map(encodeURIComponent).join("/");

				// Check if we have a saved view open
				if(!additionalParts[1]) {
					let defaultView = (map.client.padData && map.client.padData.defaultViewId && map.client.views[map.client.padData.defaultViewId]);
					if(defaultView ? map.isAtView(defaultView) : map.isAtView(null))
						ret = "#";
					else {
						for(let viewId in map.client.views) {
							if(map.isAtView(map.client.views[viewId])) {
								ret = `#q=v${encodeURIComponent(viewId)}`;
								break;
							}
						}
					}
				}

				if(parent !== window) {
					parent.postMessage({
						type: "facilmap-hash",
						hash: ret.replace(/^#/, "")
					}, "*");
				}

				return ret;
			};

			let decodeQueryString = (str) => {
				var obj = { };
				var str_split = str.split(/[;&]/);
				for(var i=0; i<str_split.length; i++) {
					var equal_sign = str_split[i].indexOf("=");
					if(equal_sign < 1) continue;

					var key = str_split[i].substr(0, equal_sign);
					var arr_match = key.match(/(\[[^\]]*\]|\.[^.]+)+$/);
					if(arr_match) {
						var arr_indexes = arr_match[0].replace(/^[.\[]/, "").replace(/\]$/, "").split(/\]\[|\./);
						arr_indexes.unshift(key.substr(0, key.length-arr_match[0].length));
						var cur_el = obj;
						for(var j=0; j<arr_indexes.length; j++) {
							var cur_key = decodeURIComponentTolerantly(arr_indexes[j]);
							if(cur_key.length == 0) {
								cur_key = 0;
								while(typeof cur_el[cur_key] != "undefined")
									cur_key++;
							}
							if(j == arr_indexes.length-1)
								cur_el[cur_key] = decodeURIComponentTolerantly(str_split[i].substr(equal_sign+1));
							else {
								if(!cur_el[cur_key] || typeof cur_el[cur_key] != "object")
									cur_el[cur_key] = { };
								cur_el = cur_el[cur_key];
							}
						}
					} else
						obj[decodeURIComponentTolerantly(key)] = decodeURIComponentTolerantly(str_split[i].substr(equal_sign+1));
				}
				return obj;
			};

			let decodeURIComponentTolerantly = (str) => {
				try {
					return decodeURIComponent(str);
				} catch(e) {
					return str;
				}
			};

			let oldToNew = (str) => {
				// Example URLs from FacilMap 1:
				// https://facilmap.org/#lon=11.7268775;lat=53.04781777;zoom=9;layer=MSfR;c.s.type=fastest;c.s.medium=car;q.0=Berlin;q.1=Hamburg;q.2=Bremen
				// https://facilmap.org/#lon=13.4385964;lat=52.5198535;zoom=11;layer=MSfR;q=Berlin
				// https://facilmap.org/#lon=13.4385964;lat=52.5198535;zoom=11;layer=MSfR;l.OPTM.visibility=1;q=Berlin

				var obj = decodeQueryString(str);

				var ret = [ obj.zoom, obj.lat, obj.lon ];

				var layers = [ ];
				if(obj.layer)
					layers.push(obj.layer);
				for(var i in obj.l || { }) {
					if(obj.l[i].visibility && map.layers[i])
						layers.push(i);
				}

				ret.push(layers.join("-"));

				if(typeof obj.q == "string")
					ret.push(obj.q);
				else if(typeof obj.s == "string")
					ret.push(obj.s);
				else if(typeof obj.q == "object") {
					Object.keys(obj.q).sort(function(a, b){return a-b}).forEach(function(i) {
						ret.push(obj.q[i]);
					});

					if(obj.c && obj.c.s && obj.c.s.medium)
						ret.push(obj.c.s.medium != "foot" ? obj.c.s.medium : "pedestrian");
				}

				return ret;
			};
		}
	};
});
