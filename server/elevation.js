const highland = require("highland");
const polyline = require("@mapbox/polyline");
const request = require("request-promise").defaults({
	gzip: true,
	headers: {
		'User-Agent': process.env.fmUserAgent
	}
});

const config = require("../config");


const API_URL = "https://elevation.mapzen.com/height";
const LIMIT = 500;
const MIN_TIME_BETWEEN_REQUESTS = 600;

const throttle = highland();
throttle.ratelimit(1, MIN_TIME_BETWEEN_REQUESTS).each((func) => {
	func();
});

const elevation = module.exports = {

	_getThrottledSlot() {
		return new Promise((resolve) => {
			throttle.write(resolve);
		});
	},

	getElevationForPoint(point) {
		return elevation.getElevationForPoints([point]).then((points) => (points[0]));
	},

	getElevationForPoints(points) {
		return Promise.resolve(points.map(() => (null)));

		/*if(points.length == 0)
			return Promise.resolve([ ]);

		let ret = Promise.resolve([ ]);
		for(let i=0; i<points.length; i+=LIMIT) {
			ret = ret.then((heights) => {
				return elevation._getThrottledSlot().then(() => (heights));
			}).then((heights) => {
				let json = {
					encoded_polyline: polyline.encode(points.slice(i, i+LIMIT).map((point) => ([point.lat, point.lon])), 6),
					range: false
				};

				return request.get({
					url: `${API_URL}?json=${encodeURI(JSON.stringify(json))}&api_key=${config.mapzenToken}`,
					json: true
				}).then((res) => (heights.concat(res.height)));
			});
		}
		return ret;*/
	},

	getAscentDescent(elevations) {
		if(!elevations.some((ele) => (ele != null))) {
			return {
				ascent: null,
				descent: null
			};
		}

		let ret = {
			ascent: 0,
			descent: 0
		};

		for(let i=1; i<elevations.length; i++) {
			if(elevations[i] > elevations[i-1])
				ret.ascent += elevations[i] - elevations[i-1];
			else
				ret.descent += elevations[i-1] - elevations[i];
		}

		return ret;
	}

};
