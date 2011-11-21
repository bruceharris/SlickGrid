(function($) {
	// args: columns, url, numRows
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
			}
		};
		
		// constructor
		// bounds is an object with properties top, bottom, left, right
		function Range(bounds){
			var me = this;
			$.extend(this, {
				///////////////////
				// properties
				
				top: Math.max(0, range.top),
				bottom: Math.min(dataCache.length - 1, range.bottom),
				left: Math.max(0, range.left),
				right: Math.min(args.columns.length - 1, range.right),
				
				_dataCache: dataCache, // so other methods added to the prototype can access the dataCache
				
				///////////////////
				// methods
				
				// returns an array of cell objects with properties row, col
				getCornerCells: function () {
					return [ {row: me.top, col: me.left}, {row: me.bottom, col: me.left}, {row: me.top, col: me.right}, {row: me.bottom, col: me.right} ];
				},
				isDataReady: function () {
					function isCellReady(cell){
						return getCellStatus(cell.row, cell.col) === READY;
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
						if (getCellStatus(cell.row, cell.col) === VIRGIN) {
							me.getData(getBlockRange(cell.row, cell.col));
						}
					});
				},
				markRequested: function () {
					this._forEachCell(function(row, col){
						setCellStatus(row, col, REQUESTED);
					});
				},
				markVirgin: function () {
					this._forEachCell(function(row, col){
						if (getCellStatus(row, col) === REQUESTED) setCellStatus(row, col, VIRGIN);
					});
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
				bottom: Math.min(top + BLOCKSIZE - 1, data.length - 1),
				left: left,
				right: Math.min(left + BLOCKSIZE - 1, args.columns.length - 1)
			};
		}
		
		// range is object with properties top, bottom, left, right
		Range.prototype.getData = function () {
			// TODO: we're always going to need to do these 2 things, hmmmm...
			this.markRequested();
			onDataLoading.notify(range);
			var me = this;
			
			$.ajax({
				url: args.url + (range.top) + '/' + (range.bottom) + '/', //TODO: need the right URL that handles cols
				dataType: 'text',
				success: function(resp){
					try {
						resp = (eval('(' + resp + ')')); // there's something weird about what DWR is giving us back that requires wrapping in ()
						if (resp.reply.rc != 0) throw { range: range, rc: resp.reply.rc, msg: resp.reply.msg };
					} catch (e) {
						throw e; // TODO: how do we want to handle this? need to ensure we mark the rows as virgin
						return;
					}
					me.loadData(resp.reply.table.rows);
				},
				error: function(jqxhr, textstatus, error){
					me.markVirgin();
					onDataLoadFailure.notify({range: range, textstatus: textstatus, error: error});
				}
			});
		}

		Range.prototype.loadData = function (resultData) {
			var me = this;
			try {
				me._forEachCell(function(row, col){
					data[row][columnKey(col)] = resultData[row - range.top].cell[col - range.left];
				});
				onDataLoaded.notify(me);
			} catch (e) {
				onDataLoadFailure.notify({range: me, error: e}); // TODO: normalize the parameters that this get passed
			}
		}

		return {
			// properties
			_data: data, // exposed for debugging
			Range: Range, // you'll need to add getData and loadData methods to the prototype of Range

			// methods
			ensureData: ensureData,
			isDataReady: isDataReady,
			getRange: function (bounds) { return new Range(bounds); },

			// grid api methods
			getItem: function (i) { return data[i]; },
			getLength: function () { return data.length; },

			// events
			onDataLoading: onDataLoading,
			onDataLoaded: onDataLoaded,
			onDataLoadFailure: onDataLoadFailure
		};
	}

	// Slick.Data.makeRemoteModel
	$.extend(true, window, { Slick: { Data: { makeRemoteModel: makeRemoteModel }}});
})(jQuery);
