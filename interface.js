(function(window, document){
	var locationPath;
	var domainPath;
	var sspImpressionID;
	var settingsPath;
	var customParamExtra;
	function Interface() {
		this.handlers = {};
		this.id = parseQuery("id");
		this.timeData = {};
		this.mediaPath = window.location.href.split("/").slice(0, -1).join('/');
	}
	Interface.prototype.init = function() {
		window.addEventListener("message", function (event) {
			var message;
			try {
				message = JSON.parse(event.data);
			} catch(err) {
				return;
			}
			if (message.id !== parseQuery("id") || !message.event) {
				return;
			}
			if (message.event.type !== "AdRemainingTimeChange") {
				CustomEvent.trackEvent(message.event.type);
				if (message.event.type !== "MRCViewable" && message.event.type !== "MRCUnviewable") {
					CustomEvent.trackEvent(message.event.type + message.event.viewState);
				}
			}
			switch(message.event.type) {
				case "AdRemainingTimeChange":
					this.timeData = message.event.data;
					if (CustomEvent.trackEvent("AdVideoProgress" + Math.round(this.timeData.currentTime))) {
						this.trackEvent("AdVideoProgress" + Math.round(this.timeData.currentTime));
					}
					var i = 0, handlerData = {};
					if (this.handlers["timeChange"] && this.handlers["timeChange"].length) {
						for(i = 0; i < this.handlers["timeChange"].length; i++) {
							handlerData = this.handlers["timeChange"][i];
							handlerData.fn.call(handlerData.ctx, message.event.data);
						}
					}
					if (this.handlers["cuePoint"] && this.handlers["cuePoint"].length) {
						for(i = 0; i < this.handlers["cuePoint"].length; i++) {
							handlerData = this.handlers["cuePoint"][i];
							if (message.event.data.currentTime >= handlerData.time && !handlerData.fired) {
								handlerData.fired = !0;
								handlerData.fn.call(handlerData.ctx, handlerData.time, message.event.data);
							}
						}
					}
					break;
				case "AdSkippableStateChange":
					$updateState.call(this, "AdSkippableStateChange", message.event.data.value);
					break;
				case "Android":
					$updateState.call(this, "Android");
					break;
				case "AdPaused":
					$updateState.call(this, "AdPaused");
					break;
				case "AdPlaying":
					$updateState.call(this, "AdPlaying");
					break;
				case "AdVolumeChange":
					$updateState.call(this, "AdVolumeChange", message.event.data.volume);
					break;
				case "SetConfig":
					this.clickUrl = message.event.data.clickUrl;
					this.customParams = message.event.data.customParams;
					customParamExtra = this.customParams["ex"];
					this.defaultVolume = message.event.data.defaultVolume;
					locationPath = message.event.data.location;
					domainPath = message.event.data.domain;
					sspImpressionID = message.event.data.ssp;
					settingsPath = message.event.data.mediapath;
					CustomEvent.init(this.customParams["us"]);
					$updateState.call(this, "SetConfig", message.event.data);
					break;
				default :
					$updateState.call(this, message.event.type, message.event.data);
			}
		}.bind(this), false);

		sendToAPP("action", {type:"AdLoaded"}, this.id);
	};
	Interface.prototype.pause = function() {
		sendToAPP("apply", {method:"pauseAd"}, this.id);
	};
	Interface.prototype.fakePause = function() {
		sendToAPP("apply", {method:"fakePauseAd"}, this.id);
	};
	Interface.prototype.stop = function() {
		sendToAPP("apply", {method:"stopAd"}, this.id);
	};
	Interface.prototype.setAdVolume = function(value) {
		sendToAPP("apply", {method:"setAdVolume", args: [value > 0 ? this.defaultVolume : 0]}, this.id);
	};
	Interface.prototype.resume = function() {
		sendToAPP("apply", {method:"resumeAd"}, this.id);
	};
	Interface.prototype.cuePoint = function(second, callback, context) {
		this.handlers.cuePoint = this.handlers.cuePoint || [];
		second = typeof second === "number" ? [second] : second;
		for(var i = 0; i < second.length; i++) {
			this.handlers.cuePoint.push({time: second[i], fn: callback, ctx: context});
		}
	};
	Interface.prototype.timeChange = function(callback, context) {
		this.handlers.timeChange = this.handlers.timeChange || [];
		this.handlers.timeChange.push({fn: callback, ctx: context});
	};
	Interface.prototype.stateChange = function(callback, context) {
		this.handlers.stateChange = this.handlers.stateChange || [];
		this.handlers.stateChange.push({fn: callback, ctx: context});
	};
	Interface.prototype.close = function() {
		sendToAPP("action", {type: "AdUserClose", id: name}, this.id);
	};
	Interface.prototype.trackEvent = function(data) {
		if (typeof data === "string") {
			data = {type: data}
		}
		sendToAPP("event", data, this.id);
	};
	Interface.prototype.resizeVideo = function(left, top, width, height) {
		sendToAPP("apply", {method:"resizeVideoElement", args: [{
			left: left,
			top: top,
			width: width,
			height: height
		}]}, this.id);
	};
	Interface.prototype.cssStyle = function(style) {
		sendToAPP("apply", {method:"cssStyle", args: [style]}, this.id);
	};
	Interface.prototype.click = function(name) {
		// check click is not disabled by ClickFrom custom parameter
		if (this.customParams["cf"] === 0 || Math.round(this.timeData.currentTime) >= this.customParams["cf"]) {
			var nam = name || "default";
			var goURL = getClickURL(this.clickUrl, nam);
			if (this.customParams["plc"]) {
				sendToAPP("action", {type: "AdClickThru", id: nam, url: goURL}, this.id);
			} else {
				window.open(goURL);
				sendToAPP("action", {type: "AdClickThru", id: nam}, this.id);
			}
			CustomEvent.trackEvent("AdClickThru");
		}
	};
	Interface.prototype.subscribe = function(eventName, handler, context) {
		eventName = typeof eventName === "string" ? [eventName] : eventName;
		for(var i = 0; i < eventName.length; i++) {
			this.handlers[eventName[i]] = this.handlers[eventName[i]] || [];
			this.handlers[eventName[i]].push({fn: callback, ctx: context});
		}
	};

	var CustomEvent = {
		init: function(n) {
			if (n) {
				this.flags.inited = true;
				this.events = {};
				var xhr = new XMLHttpRequest();
				var settingsLink = settingsPath + "settings.xml";
				xhr.open("GET", settingsLink, true);
				xhr.onreadystatechange = function (event) {
					if (event.target.readyState === XMLHttpRequest.DONE) {
						if (event.target.status == 200) {
							var xml = event.target.responseXML;
							if (xml) {
								var events = xml.querySelectorAll("TrackingEvents event");
								for(var i = 0; i < events.length; i++) {
									if (!this.events[events[i].getAttribute("name")]) {
										this.events[events[i].getAttribute("name")] = [];
									}
									this.events[events[i].getAttribute("name")].push(trimXMLNode(events[i]));
								}
							}

							this.flags.loaded = true;
							while(this.queue.length) {
								this.trackEvent(this.queue.shift()); //loading missed events
							}
						}
					}
				}.bind(this);
				xhr.send();
			}
		},
		queue: [],
		flags: {
			inited: false,
			loaded: false
		},
		trackEvent: function(eventName) {
			if (!this.flags.inited) {
				return false;
			}
			if (!this.flags.loaded) {
				this.queue.push(eventName);
				return false;
			}
			if (eventName === "AdClickThru") {
				if (this.events[eventName]) {
					this.loadEvent(eventName);
					return true;
				}
			}
			if (!this.flags[eventName]) {
				this.flags[eventName] = true;
				
				if (this.events[eventName]) {
					this.loadEvent(eventName);
					return true;
				}
			}
			return false;
		},
		loadEvent: function(name, cb) {
			for (var j = 0; j < this.events[name].length; j++) {
				var rnd = Math.round(Math.random()*1e8);
				var url = this.events[name][j];

				url = url.replace("~random~", rnd);
				url = url.replace("~RANDOM~", rnd);
				url = url.replace("%random%", rnd);
				url = url.replace("%RANDOM%", rnd);
				url = url.replace("[random]", rnd);
				url = url.replace("[RANDOM]", rnd);

				url = url.replace("~location~", locationPath);
				url = url.replace("~LOCATION~", locationPath);
				url = url.replace("%location%", locationPath);
				url = url.replace("%LOCATION%", locationPath);
				url = url.replace("[location]", locationPath);
				url = url.replace("[LOCATION]", locationPath);

				url = url.replace("~domain~", domainPath);
				url = url.replace("~DOMAIN~", domainPath);
				url = url.replace("%domain%", domainPath);
				url = url.replace("%DOMAIN%", domainPath);
				url = url.replace("[domain]", domainPath);
				url = url.replace("[DOMAIN]", domainPath);

				url = url.replace("~ssp~", sspImpressionID);
				url = url.replace("~SSP~", sspImpressionID);
				url = url.replace("%ssp%", sspImpressionID);
				url = url.replace("%SSP%", sspImpressionID);
				url = url.replace("[ssp]", sspImpressionID);
				url = url.replace("[SSP]", sspImpressionID);
				//console.log("CustomEvent => %s [%s]", name, url);
				var i = new Image();
				if (cb) {
					i.onload = i.onerror = cb;
				}
				i.src = url;
			}
		}
	};
	function trimXMLNode(node) {
		if (!node) {
			return "";
		}
		if (typeof node.firstChild != "undefined") {
			node = node.firstChild;
		}
		if (!!node && typeof node.wholeText != "undefined") {
			node = node.wholeText;
		}
		if (!!node && typeof node.trim != "undefined") {
			node = node.trim();
		}
		return node;
	}
	function $updateState(state, data) {
		if (this.handlers["stateChange"] && this.handlers["stateChange"].length) {
			for(var i = 0; i < this.handlers["stateChange"].length; i++) {
				var handlerData = this.handlers["stateChange"][i];
				handlerData.fn.call(handlerData.ctx, state, data);
			}
		}
	}
	function sendToAPP(type, data, id) {
		parent.postMessage(JSON.stringify({
			type: type,
			data: data,
			id: id
		}), "*");
	}
	function getClickURL(url, name) {
		
		if (name && name !== "default") {
			if (customParamExtra > 0) {
				return url + "&a.urlid=" + customParamExtra;
			} else {
				var ids = name.match(/\d+/g);	// get number or get last digit /[0-9]$/
				if (ids && ids.length == 1) {
					return url + "&a.urlid=" + (parseInt(ids[0]) + 0);
				}
			}
		}
		return url;
	}
	function parseQuery(name) {
		var query = location.search.substr(1).split("&");
		var result = {};
		for(var i = 0; i < query.length; i++) {
			var item = query[i].split("=");
			result[item[0]] = decodeURIComponent(item[1]);
		}
		return name ? result[name] : result;
	}

	document.body.addEventListener("contextmenu", function (event) {
		event = event || window.event;
		if (event.stopPropagation) {
			event.stopPropagation();
		}
		if (event.preventDefault) {
			event.preventDefault();
		}
		event.cancelBubble = true;
		return false;
	}); // hide context menu

	window.Interface = Interface;
})(window, document);