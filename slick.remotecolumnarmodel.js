(function($) {
	// args: colNames, url
	function RemoteModel(args){
		// private
		var data = {length:0};

		// events
		var onDataLoading = new Slick.Event();
		var onDataLoaded = new Slick.Event();
		var onDataLoadFailure = new Slick.Event();

		// data row status codes:
		var VIRGIN = 0,
			REQUESTED = 1,
			READY = 2;

		function getRowStatus(rownum){
			var r = data[rownum];
			return r ? READY : (r === undefined ? VIRGIN : REQUESTED);
		}
		function setRowStatus(rownum, stat){
			if (stat === VIRGIN) delete data[rownum];
			else if (stat === REQUESTED) data[rownum] = null;
		}
		function anyRowsNeeded(from, to){
			for (var i=from; i<=to; i++) if (getRowStatus(i) === VIRGIN) return true;
			return false;
		}

		function ensureData(from, to) {
			var PAGESIZE = 50;
			// stay in bounds
			if (from < 0) from = 0;
			if (data.length && to >= data.length) to = data.length - 1;

			if (!anyRowsNeeded(from, to)) return;

			// ensure we are getting a decent size chunk in each request
			// so if (from - to) < optimal chunk size, reach further back and forward 
			// as needed to expand chunk size

			var fwd = (getRowStatus(from) !== VIRGIN && getRowStatus(to) === VIRGIN),
				rew = (getRowStatus(to) !== VIRGIN && getRowStatus(from) === VIRGIN);

			if (fwd) {
				// find first row we need
				while (getRowStatus(from) !== VIRGIN && from < to) from++;
				// expand chunk size but not bigger than needed
				while (to < from+PAGESIZE && getRowStatus(to) === VIRGIN) to++;
			} else if (rew) {
				// find last row we need
				while (getRowStatus(to) !== VIRGIN && from < to) to--;
				while (from > to-PAGESIZE && getRowStatus(from) === VIRGIN) from--;
			} else { // missing chunk in middle or whole viewport
				while (getRowStatus(from) !== VIRGIN && from < to) from++;
				while (getRowStatus(to) !== VIRGIN && from < to) to--;
			}

			var url = args.url + from + '/' + (to - from + 1);

			// mark rows as requested that way another request won't try to get same 
			// rows if 2nd request is launched before 1st one returns
			for (var i=from; i<=to; i++) setRowStatus(i, REQUESTED);
			onDataLoading.notify({from: from, to: to});
			$.ajax({
				url: url,
				success: function(resp){ onSuccess(resp, from, to); },
				error: function(jqxhr, textstatus, error){
					for (var i=from; i<=to; i++) if (getRowStatus[i] === REQUESTED) setRowStatus(i, VIRGIN);
					onDataLoadFailure.notify({from: from, to: to, textstatus: textstatus, error: error});
				}
			});
		}

		function onSuccess(resp, from, to) {
			resp = eval(resp);
			data.length = Number(resp.totalrows);

			for (var i = 0; i < resp.numrows; i++) {
				var row = data[from + i] = {},
					colLen = args.colNames.length;
				for (var colIdx = 0; colIdx < colLen; colIdx++) {
					var col = args.colNames[colIdx];
					row[col] = resp.data[col][i];
				}
//				data[from + i].index = from + i; // do we need this? need to look at source
			}

			onDataLoaded.notify({from:from, to:to});
		}

		function isDataReady(from, to){
			for (var i=from; i<=to; i++) if (!data[i]) break;
			return i > to;
		}

		return {
			// properties
			data: data,

			// methods
			ensureData: ensureData,
			isDataReady: isDataReady,

			// events
			onDataLoading: onDataLoading,
			onDataLoaded: onDataLoaded,
			onDataLoadFailure: onDataLoadFailure
		};
	}

	// Slick.Data.RemoteModel
	$.extend(true, window, { Slick: { Data: { RemoteModel: RemoteModel }}});
})(jQuery);
