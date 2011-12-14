(function($) {
	// args: [columns], [numRows], [blockSize], fetchData
	function makeLazyLoader(args){
		// events
		var onDataLoaded = new Slick.Event();

		function columnKey(colNum){
			return args.columns[colNum].field;
		} 
		// what is the range of the block that a given row is in?
		function getBlockRange(row){
			var blockSize = args.blockSize || 50, // 50 rows
				top = Math.floor(row / blockSize) * blockSize;
			return new Range({
				top: top,
				bottom: Math.min(top + blockSize - 1, dataCache.length - 1)
			});
		}
		
		// data status codes:
		var VIRGIN = 0, REQUESTED = 1, READY = 2;

		var dataCache = {
			// properties
			length: args.numRows,
			'0': undefined, // defined here for informational purposes only, actual data rows will be added likewise by row index

			// methods
			getRowStatus: function (row) {
				return (row === undefined ? VIRGIN : (row === null ? REQUESTED : READY) );
			},
			setRowStatus: function (row, stat) {
				if (stat === VIRGIN) delete this[row];
				else if (stat === REQUESTED) this[row] = null;
			},
			loadRow: function (rowNum, cells) {
				this[rowNum] = cells;
			}
		};
		
		// constructor
		// bounds is an object with properties top, bottom
		function Range(bounds){
			this.top = Math.max(0, bounds.top);
			this.bottom = Math.min(dataCache.length - 1, bounds.bottom);
		}

		$.extend(Range.prototype, {
			// fn is a function that gets called for each 'cell' in range and gets passed rowIndex, colIndex
			fetchData: args.fetchData,
			isDataReady: function () {
				for (var r=this.top; r<=this.bottom; r++) if (dataCache.getRowStatus(r) !== READY) return false;
				return true;
			},
			ensureDataLoaded: function () {
				// check if row is needed, if so, go get its block. we won't repeat as we marks cells as 'requested'
				for (var r=this.top; r<=this.bottom; r++) if (dataCache.getRowStatus(r) === VIRGIN) getBlockRange(r).markRequested().fetchData();
			},
			markRequested: function () {
				for (var r=this.top; r<=this.bottom; r++) dataCache.setRowStatus(r, REQUESTED);
				return this;
			},
			markVirgin: function () {
				for (var r=this.top; r<=this.bottom; r++) dataCache.setRowStatus(r, VIRGIN);
				return this;
			},
			// Range.fetchData method's handler needs to call Range.loadData
			// cells is an object, its content is described by the optional (string) format argument, default is 'fields'
			//   'fields': array of objects, where each object represents a row and contains columns keyed by field name
			//   '2dArray': array of arrays, where each sub-array represents a row (or the part of the row relevant for this range) 
			//				with indices relative to range itself rather than the actual full set of columns
			//   'indices': array of objects (or arrays), where each object represents a row and contains columns keyed by column index
			//				(column indices here map to the actual full set of columns)
			loadData: function (cells, format) {
				var me = this,
					numRows = me.bottom - me.top + 1,
					numCols = me.right - me.left + 1,
					format = format || 'fields',
					colOffset = format === '2dArray' ? me.left : 0;
				for (var r=0; r<numRows; r++) {
					var row = {};
					if (format in {'2dArray':0, 'indices':0}) {
						for (var c=0; c<numCols; c++) row[c + colOffset] = cells[r][c];
						dataCache.loadRow(me.top + r, {indices: row});
					} else {
						for (var key in cells) row[key] = cells[r][key];
						dataCache.loadRow(me.top + r, {fields: row});
					}
				}
				// TODO: catch and handle failure
				onDataLoaded.notify(me);
			}
		});
		
		return {
			// properties
			_dataCache: dataCache, // exposed for debugging

			// bounds is an object with properties top, bottom, and optionally right, left
			range: function (bounds) { return new Range(bounds); },

			// grid api methods
			getItem: function (i) { return dataCache[i]; },
			getLength: function () { return dataCache.length; },

			// events
			onDataLoaded: onDataLoaded,
			onDataLoadFailure: onDataLoadFailure
		};
	}

	// Slick.Data.makeLazyLoader
	$.extend(true, window, { Slick: { Data: { makeLazyLoader: makeLazyLoader }}});
})(jQuery); 
