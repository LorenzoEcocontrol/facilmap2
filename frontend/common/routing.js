const routing = module.exports = {
	encodeMode(decodedMode) {
		let encodedMode = [decodedMode.mode || "helicopter"];

		if(decodedMode) {
			if(decodedMode.type)
				encodedMode.push(decodedMode.type);
			if(decodedMode.preference && decodedMode.preference != "fastest")
				encodedMode.push(decodedMode.preference);
			if(decodedMode.details)
				encodedMode.push("details");
			if(decodedMode.avoid && decodedMode.avoid.length > 0)
				encodedMode.push("avoid", ...decodedMode.avoid);
		}

		return encodedMode.join(" ");
	},

	decodeMode(encodedMode) {
		let decodedMode = {
			mode: "",
			type: "",
			preference: "fastest",
			details: false,
			avoid: []
		};

		if(encodedMode) {
			for(let part of encodedMode.split(/\s+/)) {
				if(["car", "bicycle", "pedestrian", "track"].includes(part))
					decodedMode.mode = part;
				else if(part == "bike")
					decodedMode.mode = "bicycle";
				else if(["foot", "walk", "walking"].includes(part))
					decodedMode.mode = "pedestrian";
				else if(["helicopter", "straight"].includes(part))
					decodedMode.mode = "";
				else if(["road", "safe", "mountain", "tour", "electric", "hiking", "wheelchair"].includes(part))
					decodedMode.type = part;
				else if(["fastest", "shortest", "recommended"].includes(part))
					decodedMode.preference = part;
				else if(part == "details")
					decodedMode.details = true;
				else if(["highways", "tollways", "ferries", "tunnels", "pavedroads", "unpavedroads", "tracks", "fords", "steps", "hills"].includes(part))
					decodedMode.avoid.push(part);
			}
		}

		return decodedMode;
	},

	formatRoutingMode(encodedMode) {
		let decodedMode = routing.decodeMode(encodedMode);

		switch(decodedMode.mode) {
			case "car":
				return "by car";
			case "bicycle":
				switch(decodedMode.type) {
					case "road":
						return "by road bike";
					case "mountain":
						return "by mountain bike";
					case "tour":
						return "by touring bike";
					case "electric":
						return "by electric bike";
					default:
						return "by bicycle";
				}
			case "pedestrian":
				switch(decodedMode.type) {
					case "wheelchair":
						return "by wheelchair";
					default:
						return "on foot";
				}
			default:
				return "";
		}
	}
};
