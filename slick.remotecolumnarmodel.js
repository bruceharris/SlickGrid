(function($) {
	function RemoteModel() {
		// private
		var PAGESIZE = 50;
		var data = {length:0};

		// events
		var onDataLoading = new Slick.Event();
		var onDataLoaded = new Slick.Event();

		function ensureData(from, to) {
			// stay in bounds
			if (from < 0) from = 0;
			if (data.length && to >= data.length) to = data.length - 1;

			if (isDataReady(from, to)) return;

			// ensure we are getting a decent size chunk in each request
			// so if (from - to) < optimal chunk size, reach further back and forward 
			// as needed to expand chunk size

			var fwd = (data[from] !== undefined && data[to] === undefined),
				rew = (data[to] !== undefined && data[from] === undefined);

			if (fwd) {
				// find first row we need
				while (data[from] !== undefined && from < to) from++;
				// expand chunk size but not bigger than needed
				while (to < from+PAGESIZE && data[to] === undefined) to++;
			} else if (rew) {
				// find last row we need
				while (data[to] !== undefined && from < to) to--;
				while (from > to-PAGESIZE && data[from] === undefined) from--;
			} else { // missing chunk in middle or whole viewport
				while (data[from] !== undefined && from < to) from++;
				while (data[to] !== undefined && from < to) to--;
			}

			var url = '/g16e/bigFakeTable/' + from + '/' + (to - from + 1);

			for (var i=from; i<=to; i++) data[i] = null; // null indicates a 'requested but not available yet'
			onDataLoading.notify();
			$.ajax({
				url: url,
				success: function(resp){ onSuccess(resp, from, to); },
				error: function(jqxhr, textstatus, error){
					//alert("error loading rows " + from + " to " + to);
					console.log('***** err ******', jqxhr, textstatus, error, from, to, data);
				}
			});
		}

		function onSuccess(resp, from, to) {
			resp = eval(resp);
			//console.log('resp:', from, to, resp);
			data.length = Number(resp.totalrows);

			for (var i = 0; i < resp.numrows; i++) {
				data[from + i] = {col1: resp.data.col1[i], col2: resp.data.col2[i], col3: resp.data.col3[i]};
				data[from + i].index = from + i;
			}
			//console.log('data:', data);

			onDataLoaded.notify({from:from, to:to});
		}

		function isDataReady(from, to){
			for (var i=from; i<=to; i++) if (!data[i]) break;
			return i > to;
		}

		return {
			// properties
			"data": data,

			// methods
			"ensureData": ensureData,
			"isDataReady": isDataReady,

			// events
			"onDataLoading": onDataLoading,
			"onDataLoaded": onDataLoaded
		};
	}

	// Slick.Data.RemoteModel
	$.extend(true, window, { Slick: { Data: { RemoteModel: RemoteModel }}});
})(jQuery);
