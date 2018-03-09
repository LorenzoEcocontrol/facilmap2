import fm from '../app';
import $ from 'jquery';
import L from 'leaflet';
import ng from 'angular';
import css from './search-route.scss';

fm.app.directive("fmSearchRoute", function($rootScope, $compile, fmUtils, $timeout, $q, fmSortableOptions, fmHighlightableLayers) {
	return {
		require: "^fmSearch",
		scope: true,
		replace: true,
		template: require("./search-route.html"),
		link(scope, el, attrs, searchUi) {
			const map = searchUi.map;

			scope.client = map.client;
			scope.className = css.className;
			scope.destinations = [ ];
			scope.submittedQueries = null;
			scope.submittedMode = null;
			scope.submittedRouteSettings = null;
			scope.errors = [ ];

			scope.sortableOptions = ng.copy(fmSortableOptions);
			scope.sortableOptions.update = function() {
				scope.reroute(true);
			};

			scope.hasRoute = function() {
				return map.routeUi.hasRoute();
			};

			scope.addDestination = function() {
				scope.destinations.push({
					query: "",
					loadingQuery: "",
					loadedQuery: "",
					suggestions: [ ]
				});
			};

			scope.addDestination();
			scope.addDestination();

			scope.removeDestination = function(idx) {
				scope.destinations.splice(idx, 1);
			};

			scope.showSearchForm = function() {
				map.searchUi.showQuery();
			};

			scope.loadSuggestions = function(destination) {
				if(destination.loadedQuery == destination.query)
					return $q.resolve();

				destination.suggestions = [ ];
				var query = destination.loadingQuery = destination.query;

				if(destination.query.trim() != "") {
					return map.client.find({ query: query }).then(function(results) {
						if(query != destination.loadingQuery)
							return; // The destination has changed in the meantime

						if(fmUtils.isSearchId(query) && results.length > 0 && results[0].display_name)
							destination.query = query = results[0].display_name;

						destination.suggestions = results;
						destination.loadedQuery = query;
						destination.selectedSuggestionIdx = 0;
					}).catch(function(err) {
						if(query != destination.loadingQuery)
							return; // The destination has changed in the meantime

						console.warn(err.stack || err);
						scope.errors.push(err);
					});
				}
			};

			let suggestionMarker = null;

			scope.suggestionMouseOver = function(suggestion) {
				suggestionMarker = (new fmHighlightableLayers.Marker([ suggestion.lat, suggestion.lon ], {
					highlight: true,
					colour: map.dragMarkerColour,
					size: 35,
					symbol: suggestion.icon
				})).addTo(map.map);
			};

			scope.suggestionMouseOut = function(suggestion) {
				if(suggestionMarker) {
					suggestionMarker.remove();
					suggestionMarker = null;
				}
			};

			scope.suggestionZoom = function(suggestion) {
				map.map.flyTo([ suggestion.lat, suggestion.lon ]);
			};


			scope.highlightedIdx = null;
			let highlightedMarker = null;

			scope.destinationMouseOver = function(idx) {
				let destination = scope.destinations[idx];
				if(!destination)
					return;

				let suggestion = destination.suggestions[destination.selectedSuggestionIdx] || destination.suggestions[0];

				if(destination.query == destination.loadedQuery && suggestion) {
					let marker = map.routeUi.getMarker(idx);
					if(marker && marker.getLatLng().equals([ suggestion.lat, suggestion.lon ])) {
						highlightedMarker = marker;
						scope.highlightedIdx = idx;
						marker.setStyle({ highlight: true });
					}
				}
			};

			scope.destinationMouseOut = function(idx) {
				if(highlightedMarker) {
					highlightedMarker.setStyle({ highlight: false });
					scope.highlightedIdx = null;
					highlightedMarker = null;
				}
			};

			map.mapEvents.$on("routeDestinationMouseOver", (e, [ idx ]) => {
				scope.destinationMouseOver(idx);
			});

			map.mapEvents.$on("routeDestinationMouseOut", (e, [ idx ]) => {
				scope.destinationMouseOut(idx);
			});



			scope.route = function(noZoom) {
				scope.reset();

				if(scope.destinations[0].query.trim() == "" || scope.destinations[scope.destinations.length-1].query.trim() == "")
					return;

				var points;
				var mode = scope.routeMode;
				var routeSettings = ng.copy(scope.routeSettings);

				scope.submittedQueries = scope.destinations.map(function(destination) {
					if(destination.loadedQuery == destination.query && destination.suggestions.length)
						return destination.suggestions[destination.selectedSuggestionIdx].id || destination.suggestions[0].id;
					else
						return destination.query;
				});
				scope.submittedMode = mode;
				scope.submittedRouteSettings = routeSettings;

				map.mapEvents.$broadcast("searchchange");

				return $q.all(scope.destinations.map(scope.loadSuggestions)).then(function() {
					points = scope.destinations.filter(function(destination) {
						return destination.query.trim() != "";
					}).map(function(destination) {
						return destination.suggestions[destination.selectedSuggestionIdx] || destination.suggestions[0];
					});

					if(points.includes(undefined))
						throw new Error("Some destinations could not be found.");

					scope.submittedQueries = points.map(function(point) {
						return point.id;
					});

					map.mapEvents.$broadcast("searchchange");

					return map.routeUi.setRoute(points.map(function(point) { return { lat: point.lat, lon: point.lon }; }), mode, routeSettings).then(() => {
						if(!noZoom)
							map.routeUi.zoom();
					});
				}).catch((err) => {
					console.warn(err.stack || err);
					scope.errors.push(err);
				});
			};

			scope.reroute = function(noZoom) {
				if(scope.hasRoute())
					scope.route(noZoom);
			};

			scope.reset = function() {
				scope.submittedQueries = null;
				scope.submittedMode = null;
				scope.submittedRouteSettings = null;
				scope.errors = [];

				if(suggestionMarker) {
					suggestionMarker.remove();
					suggestionMarker = null;
				}

				map.routeUi.clearRoute();
			};

			scope.clear = function() {
				scope.reset();

				scope.destinations = [ ];
				scope.addDestination();
				scope.addDestination();
			};

			scope.$watch("routeMode", (routeMode) => {
				scope.reroute(true);
			});

			scope.$watch("routeSettings", (routeSettings) => {
				scope.reroute(true);
			}, true);

			map.mapEvents.$on("routeDestinationAdd", (e, [ idx ]) => {
				scope.destinations.splice(idx, 0, makeCoordDestination(map.client.route.routePoints[idx]));
				if(scope.submittedQueries)
					scope.submittedQueries.splice(idx, 0, makeCoordDestination(map.client.route.routePoints[idx]).query);
				map.mapEvents.$broadcast("searchchange");
			});

			map.mapEvents.$on("routeDestinationMove", (e, [ idx ]) => {
				scope.destinations[idx] = makeCoordDestination(map.client.route.routePoints[idx]);
				if(scope.submittedQueries)
					scope.submittedQueries[idx] = makeCoordDestination(map.client.route.routePoints[idx]).query;
				map.mapEvents.$broadcast("searchchange");
			});

			map.mapEvents.$on("routeDestinationRemove", (e, [ idx ]) => {
				scope.destinations.splice(idx, 1);
				if(scope.submittedQueries)
					scope.submittedQueries.splice(idx, 1);
				map.mapEvents.$broadcast("searchchange");
			});

			map.mapEvents.$on("routeClear", () => {
				scope.submittedQueries = null;
				scope.submittedMode = null;
				scope.submittedRouteSettings = null;
				map.mapEvents.$broadcast("searchchange");
			});

			function makeCoordDestination(lonlat) {
				var disp = fmUtils.round(lonlat.lat, 5) + "," + fmUtils.round(lonlat.lon, 5);
				return {
					query: disp,
					loadingQuery: disp,
					loadedQuery: disp,
					selectedSuggestionIdx: 0,
					suggestions: [ {
						lat: lonlat.lat,
						lon: lonlat.lon,
						display_name: disp,
						short_name: disp,
						type: "coordinates",
						id: disp
					} ]
				};
			}

			function _setDestination(dest, query, suggestions, selectedSuggestion) {
				dest.query = query;

				if(suggestions) {
					dest.suggestions = suggestions;
					dest.loadingQuery = dest.loadedQuery = query;
					dest.selectedSuggestionIdx = Math.max(suggestions.indexOf(selectedSuggestion), 0);
				}
			}

			var routeUi = searchUi.routeUi = {
				show: function() {
					el.show();
				},

				hide: function() {
					scope.reset();
					el.hide();
				},

				setQueries: function(queries) {
					scope.submittedQueries = null;
					scope.submittedMode = null;
					scope.submittedRouteSettings = null;
					scope.destinations = [ ];

					for(var i=0; i<queries.length; i++) {
						if(scope.destinations.length <= i)
							scope.addDestination();

						$.extend(scope.destinations[i], typeof queries[i] == "object" ? queries[i] : { query: queries[i] });
					}

					while(scope.destinations.length < 2)
						scope.addDestination();
				},

				setFrom: function(from, suggestions, selectedSuggestion) {
					_setDestination(scope.destinations[0], from, suggestions, selectedSuggestion);
				},

				addVia: function(via, suggestions, selectedSuggestion) {
					scope.addDestination();
					var newDest = scope.destinations.pop();
					_setDestination(newDest, via, suggestions, selectedSuggestion);
					scope.destinations.splice(scope.destinations.length-1, 0, newDest);
				},

				setTo: function(to, suggestions, selectedSuggestion) {
					_setDestination(scope.destinations[scope.destinations.length-1], to, suggestions, selectedSuggestion);
				},

				setMode: function(mode) {
					let decoded = routeUi.decodeMode(mode);
					scope.routeMode = decoded.mode;
					scope.routeSettings = decoded.routeSettings;
				},

				getQueries: function() {
					return scope.submittedQueries;
				},

				getTypedQueries: function() {
					return scope.destinations.map((destination) => (destination.query));
				},

				getMode: function() {
					return routeUi.encodeMode(scope.submittedMode, scope.submittedRouteSettings);
				},

				submit: function(noZoom) {
					scope.route(noZoom);
				},

				getCurrentSearchForHash() {
					var queries = routeUi.getQueries();
					if(queries)
						return queries.join(" to ") + " by " + routeUi.getMode();


				},

				hasResults() {
					return map.routeUi.routes.length > 0
				},

				encodeMode(mode, routeSettings) {
					let encoded = [mode || "helicopter"];

					if(routeSettings) {
						if(routeSettings.type)
							encoded.push(routeSettings.type);
						if(routeSettings.preference && routeSettings.preference != "fastest")
							encoded.push(routeSettings.preference);
						if(routeSettings.details)
							encoded.push("details");
						if(routeSettings.avoid && routeSettings.avoid.length > 0)
							encoded.push("avoid", ...routeSettings.avoid);
					}

					return encoded.join(" ");
				},

				decodeMode(encoded) {
					let ret = {
						mode: "",
						routeSettings: {
							type: "",
							preference: "fastest",
							details: false,
							avoid: []
						}
					};

					for(let part of encoded.split(/\s+/)) {
						if(["car", "bicycle", "pedestrian"].includes(part))
							ret.mode = part;
						else if(part == "helicopter")
							ret.mode = "";
						else if(["road", "safe", "mountain", "tour", "electric", "hiking", "wheelchair"].includes(part))
							ret.routeSettings.type = part;
						else if(["fastest", "shortest", "recommended"].includes(part))
							ret.routeSettings.preference = part;
						else if(part == "details")
							ret.routeSettings.details = true;
						else if(["highways", "tollways", "ferries", "tunnels", "pavedroads", "unpavedroads", "tracks", "fords", "steps", "hills"].includes(part))
							ret.routeSettings.avoid.push(part);
					}

					return ret;
				}
			};

			scope.$on("$destroy", () => {
				scope.reset();
				el.remove();
				searchUi.routeUi = null;
			})
		}
	};
});
