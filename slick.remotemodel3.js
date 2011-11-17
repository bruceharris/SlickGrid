(function($) {
	// args: columns, url, [pageSize]
	function makeRemoteModel(args){
		var data = {length: args.numRows};

		// events
		var onDataLoading = new Slick.Event();
		var onDataLoaded = new Slick.Event();
		var onDataLoadFailure = new Slick.Event();

		// data status codes:
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
		// what is the range of the block that a given cell is in?
		function getBlockRange(row, col){
			var BLOCKSIZE = 50, // 50 * 50 cells for each block
				top = Math.floor(row / BLOCKSIZE) * BLOCKSIZE,
				left = Math.floor(col / BLOCKSIZE) * BLOCKSIZE;
			return {
				top: top,
				bottom: top + BLOCKSIZE - 1,
				left: left,
				right: left + BLOCKSIZE - 1
			};
		}

		// not doing anything with left/right yet
		function ensureData(top, bottom, left, right) {
			var PAGESIZE = args.pageSize || 50;

			// stay in bounds
			top = Math.max(0, top);
			if (data.length && bottom >= data.length) bottom = data.length - 1;
			left = Math.max(0, left);
			right = Math.max(columns.length - 1, right);

			if (!anyRowsNeeded(top, bottom)) return;

			// ensure we are getting a decent size chunk in each request
			// so if (top - bottom) < optimal chunk size, reach further back and forward 
			// as needed to expand chunk size

			var fwd = (getRowStatus(top) !== VIRGIN && getRowStatus(bottom) === VIRGIN),
				rew = (getRowStatus(bottom) !== VIRGIN && getRowStatus(top) === VIRGIN);

			if (fwd) {
				// find first row we need
				while (getRowStatus(top) !== VIRGIN && top < bottom) top++;
				// expand chunk size but not bigger than needed
				while (bottom < top+PAGESIZE && getRowStatus(bottom) === VIRGIN) bottom++;
			} else if (rew) {
				// find last row we need
				while (getRowStatus(bottom) !== VIRGIN && top < bottom) bottom--;
				while (top > bottom-PAGESIZE && getRowStatus(top) === VIRGIN) top--;
			} else { // missing chunk in middle or whole viewport
				while (getRowStatus(top) !== VIRGIN && top < bottom) top++;
				while (getRowStatus(bottom) !== VIRGIN && top < bottom) bottom--;
			}

// generalize?
			var url = args.url + (top) + '/' + (bottom) + '/';

			// mark rows as requested that way another request won't try to get same 
			// rows if 2nd request is launched before 1st one returns
			for (var i=top; i<=bottom; i++) setRowStatus(i, REQUESTED);
			onDataLoading.notify({from: top, to: bottom});
			$.ajax({
				url: url,
				dataType: 'text',
				success: function(resp){ loadData(resp, top, bottom); },
				error: function(jqxhr, textstatus, error){
					for (var i=top; i<=bottom; i++) if (getRowStatus(i) === REQUESTED) setRowStatus(i, VIRGIN);
					onDataLoadFailure.notify({from: top, to: bottom, textstatus: textstatus, error: error});
				}
			});
		}

		function resultMetadata(result){
			return {
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
/*
			???
			getItemMetadata: function (row) {
				// for each column, return a formatter for that row
				return { columns: };
			},
*/
			// events
			onDataLoading: onDataLoading,
			onDataLoaded: onDataLoaded,
			onDataLoadFailure: onDataLoadFailure
		};
	}

	// Slick.Data.RemoteModel
	$.extend(true, window, { Slick: { Data: { makeRemoteModel: makeRemoteModel }}});
})(jQuery);
