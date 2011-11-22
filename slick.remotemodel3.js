(function($) {
	// args: columns, numRows
	function makeRemoteModel(args){
		// events
		var onDataLoading = new Slick.Event(),
			onDataLoaded = new Slick.Event(),
			onDataLoadFailure = new Slick.Event();

		function columnKey(colNum){
			return args.columns[colNum].field;
		} 
		// for the function passed in, do all elements of this array return true?
		// fn gets passed (el,i) and returns boolean
		function areAllTrue(arr, fn){
			var l = arr.length;
			for (var i=0; i<l; i++) if (!fn(arr[i], i)) return false;
			return true;
		}
		
		// data status codes:
		var VIRGIN = 0, REQUESTED = 1, READY = 2;

		var dataCache = {
			// properties
			length: args.numRows,
			'0': undefined, // defined here for informational purposes only, actual data rows will be added by row index

			// methods
			getCellStatus: function (row, col) {
				var r = this[row];
				return (r === undefined || r && r[columnKey(col)] === undefined ? VIRGIN :
						(r[columnKey(col)] === null ? REQUESTED : READY) );
			},
			setCellStatus: function (row, col, stat) {
				if (!this[row]) this[row] = {};
				if (stat === VIRGIN) delete this[row][columnKey(col)];
				else if (stat === REQUESTED) this[row][columnKey(col)] = null;
			},
			// cells is an object that must have one of the following properties:
			//   fields: object with data values in named fields
			//   indices: object with data values by column index
			loadCells: function (rowNum, cells) {
				if ('fields' in cells) {
					if (!this[rowNum]) this[rowNum] = cells.fields;
					else for (var fld in cells.fields) this[rowNum][fld] = cells.fields[fld];
				} else if ('indices' in cells) {
					if (!this[rowNum]) this[rowNum] = {};
					for (var i in cells.indices) this[rowNum][columnKey(i)] = cells.indices[i];
				}
			}
		};
		
		// constructor
		// bounds is an object with properties top, bottom, left, right
		function Range(bounds){
			var me = this;
			$.extend(this, {
				// --- properties ---
				
				top: Math.max(0, bounds.top),
				bottom: Math.min(dataCache.length - 1, bounds.bottom),
				left: Math.max(0, bounds.left || 0), 
				right: Math.min(args.columns.length - 1, bounds.right || 99999), // arbitrary large number > supportable columns
				
				// --- methods ---
				
				bounds: function () {
					return {top: me.top, bottom: me.bottom, left: me.left, right: me.right};
				},
				// returns an array of cell objects with properties row, col
				getCornerCells: function () {
					return [ {row: me.top, col: me.left}, {row: me.bottom, col: me.left}, {row: me.top, col: me.right}, {row: me.bottom, col: me.right} ];
				},
				isDataReady: function () {
					function isCellReady(cell){
						return dataCache.getCellStatus(cell.row, cell.col) === READY;
					}
					// we are making an assumption that blocks are big enough that there can't be a hole in the middle of the corners
					return areAllTrue(me.getCornerCells(), isCellReady);
				},
				// fn is a function that gets called for each 'cell' in range and gets passed rowIndex, colIndex
				_forEachCell: function (fn) {
					for (var r=me.top; r<=me.bottom; r++) for (var c=me.left; c<=me.right; c++) fn(r,c);
				},
				ensureData: function () {
					// for each corner of the range, check if that cell is needed,
					// if needed, go get its block. we won't repeat as getData marks cells as 'requested'
					$.each(me.getCornerCells(), function(i, cell){
						if (dataCache.getCellStatus(cell.row, cell.col) === VIRGIN) {
							me.markRequested();
							onDataLoading.notify(me);
							me.getData(getBlockRange(cell.row, cell.col));
						}
					});
				},
				markRequested: function () {
					this._forEachCell(function(row, col){
						dataCache.setCellStatus(row, col, REQUESTED);
					});
				},
				markVirgin: function () {
					this._forEachCell(function(row, col){
						if (dataCache.getCellStatus(row, col) === REQUESTED) dataCache.setCellStatus(row, col, VIRGIN);
					});
				},
				// Range.getData method's handler needs to call Range.loadData
				// cells is an object, its content is specified by the optional (string) format argument, default is '2dArray'
				//   2dArray: array of arrays, where each sub-array represents a row (or the part of the row relevant for this range) 
				//				with indices relative to range itself rather than the actual full set of columns
				//   indices: array of objects (or arrays), where each object represents a row and contains columns keyed by column index
				//				(column indices here map to the actual full set of columns)
				//   fields: array of objects, where each object represents a row and contains columns keyed by field name
				loadData: function (cells, format) {
					console.log('called loadData', this, cells, format);
					var me = this,
						numRows = me.bottom - me.top + 1,
						numCols = me.right - me.left + 1,
						format = format || '2dArray',
						colOffset = format === '2dArray' ? me.left : 0;
					for (var r=0; r<numRows; r++) {
						var row = {};
						if (format in {'2dArray':0, 'indices':0}) {
							for (var c=0; c<numCols; c++) row[c + colOffset] = cells[r][c];
							dataCache.loadCells(me.top + i, {indices: row});
						} else {
							for (var key in cells) row[key] = cells[r][key];
							dataCache.loadCells(me.top + i, {fields: row});
						}
					}
					// TODO: catch and handle failure
					onDataLoaded.notify(me.bounds());
				}
			});
		}
		
		// what is the range of the block that a given cell is in?
		function getBlockRange(row, col){
			var BLOCKSIZE = 50, // 50 * 50 cells for each block
				top = Math.floor(row / BLOCKSIZE) * BLOCKSIZE,
				left = Math.floor(col / BLOCKSIZE) * BLOCKSIZE;
			return {
				top: top,
				bottom: Math.min(top + BLOCKSIZE - 1, dataCache.length - 1),
				left: left,
				right: Math.min(left + BLOCKSIZE - 1, args.columns.length - 1)
			};
		}
		
		return {
			// properties
			_dataCache: dataCache, // exposed for debugging
			Range: Range, // you'll need to add a getData method to the prototype of Range

			// range has methods ensureData and isDataReady
			getRange: function (bounds) { return new Range(bounds); },

			// grid api methods
			getItem: function (i) { return dataCache[i]; },
			getLength: function () { return dataCache.length; },

			// TODO: need to figure out if we need events for this
			// events
			onDataLoading: onDataLoading,
			onDataLoaded: onDataLoaded,
			onDataLoadFailure: onDataLoadFailure
		};
	}

	// Slick.Data.makeRemoteModel
	$.extend(true, window, { Slick: { Data: { makeRemoteModel: makeRemoteModel }}});
})(jQuery); 