(function($) {
	// options: columns, numRows, getData
	function makeLazyLoader(options){
		// events
		var onDataLoading = new Slick.Event(), //BH not sure if we need this one
			onDataLoaded = new Slick.Event(),
			onDataLoadFailure = new Slick.Event();

		function columnKey(colNum){
			return options.columns[colNum].field;
		} 
		// for the function passed in, do all elements of this array return true?
		// fn gets passed (el,i) and returns boolean
		function areAllTrue(arr, fn){
			var l = arr.length;
			for (var i=0; i<l; i++) if (!fn(arr[i], i)) return false;
			return true;
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
				right: Math.min(left + BLOCKSIZE - 1, options.columns.length - 1)
			};
		}
		
		// data status codes:
		var VIRGIN = 0, REQUESTED = 1, READY = 2;

		var dataCache = {
			// properties
			length: options.numRows,
			'0': undefined, // defined here for informational purposes only, actual data rows will be added likewise by row index

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
			this.top = Math.max(0, bounds.top);
			this.bottom = Math.min(dataCache.length - 1, bounds.bottom);
			this.left = Math.max(0, bounds.left || 0);
			this.right = Math.min(options.columns.length - 1, bounds.right || 99999); // arbitrary large number that is > supportable columns
		}

		$.extend(Range.prototype, {
			// returns an array of cell objects with properties row, col
			_getCornerCells: function () {
				return [ {row: this.top, col: this.left}, {row: this.bottom, col: this.left}, {row: this.top, col: this.right}, {row: this.bottom, col: this.right} ];
			},
			// fn is a function that gets called for each 'cell' in range and gets passed rowIndex, colIndex
			_forEachCell: function (fn) {
				for (var r=this.top; r<=this.bottom; r++) for (var c=this.left; c<=this.right; c++) fn(r,c);
			},
			getData: options.getData,
			isDataReady: function () {
				function isCellReady(cell){
					return dataCache.getCellStatus(cell.row, cell.col) === READY;
				}
				// we are making an assumption that blocks are big enough that there can't be a hole in the middle of the corners
				return areAllTrue(this._getCornerCells(), isCellReady);
			},
			bounds: function () {
				return {top: this.top, bottom: this.bottom, left: this.left, right: this.right};
			},
			// if data is already loaded, returns true, else goes gets the data and returns false
			ensureDataLoaded: function () {
				if (this.isDataReady()) return true;
				var me = this;
				// for each corner of the range, check if that cell is needed,
				// if needed, go get its block. we won't repeat as getData marks cells as 'requested'
				// we are making an assumption that blocks are big enough that there can't be a hole in the middle of the corners
				$.each(me._getCornerCells(), function(i, cell){
					if (dataCache.getCellStatus(cell.row, cell.col) === VIRGIN) {
						me.markRequested();
						onDataLoading.notify(me.bounds());
						me.getData(getBlockRange(cell.row, cell.col));
					}
				});
				return false;
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
						dataCache.loadCells(me.top + r, {indices: row});
					} else {
						for (var key in cells) row[key] = cells[r][key];
						dataCache.loadCells(me.top + r, {fields: row});
					}
				}
				// TODO: catch and handle failure
				onDataLoaded.notify(me.bounds());
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
			onDataLoading: onDataLoading,
			onDataLoaded: onDataLoaded,
			onDataLoadFailure: onDataLoadFailure
		};
	}

	// Slick.Data.makeLazyLoader
	$.extend(true, window, { Slick: { Data: { makeLazyLoader: makeLazyLoader }}});
})(jQuery); 