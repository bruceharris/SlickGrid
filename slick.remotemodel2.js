(function($) {
	// args: columns, url, [pageSize]
	function makeRemoteModel(args){
		// private
		var data = {length: args.numRows};

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
			var PAGESIZE = args.pageSize || 50;

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

// generalize
			var url = args.url + (from) + '/' + (to) + '/';

			// mark rows as requested that way another request won't try to get same 
			// rows if 2nd request is launched before 1st one returns
			for (var i=from; i<=to; i++) setRowStatus(i, REQUESTED);
			onDataLoading.notify({from: from, to: to});
// >> generalize
			$.ajax({
				url: url,
				dataType: 'text',
				success: function(resp){ loadData(resp, from, to); },
				error: function(jqxhr, textstatus, error){
					for (var i=from; i<=to; i++) if (getRowStatus(i) === REQUESTED) setRowStatus(i, VIRGIN);
					onDataLoadFailure.notify({from: from, to: to, textstatus: textstatus, error: error});
				}
			});
// << to here
		}

		function resultMetadata(result){
			return {
				//totalrows: 30000,// Number(result.reply.totalrows),
				numrows: Number(result.reply.table.rows.length)
			};
		}
		function extractCell(result, colNum, rowNum){
			return result.reply.table.rows[rowNum].cell[colNum];
		}

		function loadData(resp, from, to) {
			resp = (eval('(' + resp + ')')); // there's something weird about what DWR is giving us back that requires wrapping in ()
			var meta = resultMetadata(resp);
			//data.length = meta.totalrows;

			// for every row in the current result set
			for (var i = 0; i < meta.numrows; i++) {
				var row = data[from + i] = {},
					colLen = args.columns.length;
				for (var colIdx = 0; colIdx < colLen; colIdx++) {
					var colName = args.columns[colIdx].field;
					row[colName] = extractCell(resp, colIdx, i);
				}
			}

			onDataLoaded.notify({from:from, to:to});
		}

		function isDataReady(from, to){
			for (var i=from; i<=to; i++) if (!data[i]) break;
			return i > to;
		}

		return {
			// properties
			_data: data, // exposed for debugging

			// methods
			ensureData: ensureData,
			isDataReady: isDataReady,

			// grid api methods
			getItem: function (i) { return data[i]; },
			getLength: function () { return data.length; },

			// events
			onDataLoading: onDataLoading,
			onDataLoaded: onDataLoaded,
			onDataLoadFailure: onDataLoadFailure
		};
	}

	// Slick.Data.RemoteModel
	$.extend(true, window, { Slick: { Data: { makeRemoteModel: makeRemoteModel }}});
})(jQuery);
