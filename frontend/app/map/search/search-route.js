(function(fp, $, ng, undefined) {

	fp.app.factory("fpMapSearchRoute", function($rootScope, $templateCache, $compile, fpUtils, L, $timeout, $q) {
		return function(map, searchUi) {
			var activeStyle = {
				color : '#0000ff',
				weight : 8,
				opacity : 0.7
			};

			var inactiveStyle = {
				color : '#0000ff',
				weight : 6,
				opacity : 0.3
			};

			var scope = $rootScope.$new(true);

			scope.routeMode = 'car';
			scope.destinations = [ ];

			scope.sortableOptions = ng.copy($rootScope.sortableOptions);
			scope.sortableOptions.update = function() {
				scope.reroute();
			};

			scope.addDestination = function() {
				scope.destinations.push({
					query: "",
					suggestions: [ ]
				});
			};

			scope.addDestination();
			scope.addDestination();

			scope.removeDestination = function(idx) {
				scope.destinations.splice(idx, 1);
			};

			scope.showSearchForm = function() {
				routeUi.hide();
				searchUi.show();
			};

			scope.loadSuggestions = function(destination) {
				return $q(function(resolve, reject) {
					if(destination.suggestionQuery == destination.query)
						return resolve();

					destination.suggestions = [ ];
					destination.suggestionQuery = null;
					destination.selectedSuggestionIdx = null;
					if(destination.query.trim() != "") {
						var query = destination.query;

						map.loadStart();
						map.socket.emit("find", { query: query }, function(err, results) {
							map.loadEnd();

							if(err) {
								map.messages.showMessage("danger", err);
								return reject(err);
							}

							destination.suggestions = results;
							destination.suggestionQuery = query;
							destination.selectedSuggestionIdx = 0;

							resolve();
						});
					}
				});
			};

			scope.route = function() {
				scope.reset();

				$q.all(scope.destinations.map(scope.loadSuggestions)).then(function() {
					var points = scope.destinations.map(function(destination) {
						if(destination.suggestions.length == null)
							throw "No place has been found for search term “" + destination.query + "”.";

						var sug = destination.suggestions[destination.selectedSuggestionIdx] || destination.suggestions[0];
						return { lat: sug.lat, lon: sug.lon };
					});

					return $q(function(resolve, reject) {
						map.socket.emit("getRoutes", { destinations: points, mode: scope.routeMode }, function(err, res) {
							err ? reject(err) : resolve(res);
						});
					});
				}).then(function(routes) {
					routes.forEach(function(route, i) {
						route.short_name = "Option " + (i+1);
						route.display_name = route.short_name + " (" + fpUtils.round(route.distance, 2) + " km, " + fpUtils.formatTime(route.time) + " h)";
						route.routeMode = scope.routeMode;
					});

					scope.routes = routes;
					scope.activeRouteIdx = 0;
					renderResults();
				}).catch(function(err) {
					scope.routeError = err;
				});
			};

			scope.reroute = function() {
				if(scope.routes || scope.routeError)
					scope.route();
			};

			scope.reset = function() {
				scope.routes = [ ];
				scope.routeError = null;
				scope.activeRouteIdx = null;
			};

			scope.setActiveRoute = function(routeIdx) {
				scope.activeRouteIdx = routeIdx;
				updateStyle();
			};

			var el = $($templateCache.get("map/search/search-route.html")).insertAfter(map.map.getContainer());
			$compile(el)(scope);
			scope.$evalAsync(); // $compile only replaces variables on next digest

			var layerGroup = L.featureGroup([]).addTo(map.map);

			function renderResults() {
				clearRenders();

				scope.routes.forEach(function(route, i) {
					var layer = L.polyline(route.trackPoints.map(function(it) { return [ it.lat, it.lon ] }), i == scope.activeRouteIdx ? activeStyle : inactiveStyle)
						.bindPopup($("<div/>")[0], map.popupOptions)
						.on("popupopen", function(e) {
							scope.setActiveRoute(i);
							renderRoutePopup(route, e.popup);
						}.fpWrapApply(scope))
						.on("popupclose", function(e) {
							ng.element(e.popup.getContent()).scope().$destroy();
						})
						.bindTooltip(route.display_name, $.extend({}, map.tooltipOptions, { sticky: true, offset: [ 20, 0 ] }));

					layerGroup.addLayer(layer);

					if(i == scope.activeRouteIdx)
						layer.openPopup();
				});

				map.map.flyToBounds(layerGroup.getBounds());
			}

			function updateStyle() {
				layerGroup.getLayers().forEach(function(layer, i) {
					layer.setStyle(i == scope.activeRouteIdx ? activeStyle : inactiveStyle);

					if(i == scope.activeRouteIdx)
						layer.openPopup();
				})
			}

			function clearRenders() {
				layerGroup.clearLayers();
			}

			function renderRoutePopup(route, popup) {
				var scope = map.socket.$new();

				scope.route = route;

				scope.addToMap = function(type) {
					if(type == null) {
						for(var i in map.socket.types) {
							if(map.socket.types[i].type == "line") {
								type = map.socket.types[i];
								break;
							}
						}
					}

					//map.markersUi.createMarker(result, type, { name: result.display_name });
				};

				var el = popup.getContent();
				$(el).html($templateCache.get("map/search/route-popup.html"));
				$compile(el)(scope);

				// Prevent popup close on button click
				$("button", el).click(function(e) {
					e.preventDefault();
				});

				$timeout(function() { $timeout(function() { // $compile only replaces variables on next digest
					popup.update();
				}); });
			}

			var routeUi = {
				show: function() {
					el.show();
				},

				hide: function() {
					el.hide();
				}
			};
			routeUi.hide();
			return routeUi;
		};
	});

})(FacilPad, jQuery, angular);